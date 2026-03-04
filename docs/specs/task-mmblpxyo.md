# Implementation Spec: Pipeline Runs Duplication Fix

**Task ID**: task-mmblpxyo  
**Title**: Pipeline Runs: collapse running + result into single entry  
**Attempt**: 1  
**Date**: 2026-03-04

## Problem Statement

In the task detail modal, Pipeline Runs currently shows **two entries per stage** — one with status "running" and another with the final result ("passed"/"failed"). Users expect to see only **one entry per stage per attempt** that updates in place:

- **While running** → show "running" status
- **When complete** → replace with final status and show result text
- **Not both** → eliminate the duplication

## Root Cause Analysis

### Current API Behavior ❌

The `/api/tasks/[id]/runs` POST endpoint **creates new Run records** for both stage start and stage completion:

**Stage Start:**
```http
POST /api/tasks/task-123/runs
{
  "attempt": 1,
  "stage": "scout", 
  "status": "running",
  "agent": "scout"
}
```
→ **Creates Run #1**: `{ status: "running", finished_at: null }`

**Stage Completion:**
```http
POST /api/tasks/task-123/runs  
{
  "attempt": 1,
  "stage": "scout",
  "status": "passed", 
  "result": "Spec created successfully",
  "duration_ms": 45000
}
```
→ **Creates Run #2**: `{ status: "passed", finished_at: "2026-03-04T05:35:00Z", result: "..." }`

### Database Impact

This results in **multiple runs** with identical `task_id`, `attempt`, and `stage`:

```sql
SELECT * FROM runs WHERE task_id = 'task-123' AND attempt = 1 AND stage = 'scout';
-- Result:
-- id=1  status=running  finished_at=null     result=null
-- id=2  status=passed   finished_at=...      result="Spec created..."
```

### UI Impact

The task detail modal displays **both records**, creating visual clutter:

```
Pipeline Runs:
🔍 Scout         running    Attempt 1    —
🔍 Scout         passed     Attempt 1    45s    "Spec created successfully"
```

**Expected behavior:**
```  
Pipeline Runs:
🔍 Scout         passed     Attempt 1    45s    "Spec created successfully"
```

## Implementation Plan

### 1. Modify Runs API to Support Updates

**File**: `src/routes/api/tasks/[id]/runs/+server.ts`

**Current Logic:**
```typescript
export const POST: RequestHandler = async ({ params, request }) => {
  // Always creates new record
  const stmt = db.prepare(`INSERT INTO runs (...) VALUES (...)`);
  const info = stmt.run(...);
  return json(run, { status: 201 });
};
```

**New Logic:**
```typescript
export const POST: RequestHandler = async ({ params, request }) => {
  const db = getDb();
  const body = await request.json();
  const { attempt, stage, agent, status, result, duration_ms } = body;

  // Check if a run already exists for this task/attempt/stage
  const existingRun = db.prepare(`
    SELECT * FROM runs 
    WHERE task_id = ? AND attempt = ? AND stage = ?
  `).get(params.id, attempt, stage);

  if (existingRun) {
    // Update existing run (stage completion)
    const updateStmt = db.prepare(`
      UPDATE runs SET 
        status = ?, 
        result = ?, 
        finished_at = ?, 
        duration_ms = ?
      WHERE id = ?
    `);
    
    updateStmt.run(
      status,
      result || null,
      status !== 'running' ? new Date().toISOString() : null,
      duration_ms || null,
      existingRun.id
    );
    
    const updatedRun = db.prepare('SELECT * FROM runs WHERE id = ?').get(existingRun.id);
    
    // Create appropriate event
    const eventType = status === 'passed' ? 'stage_pass' : 'stage_fail';
    const msg = `${stage} ${status}${result ? ': ' + result.substring(0, 200) : ''}`;
    db.prepare(`INSERT INTO events (task_id, type, message, agent) VALUES (?, ?, ?, ?)`).run(
      params.id, eventType, msg, agent
    );
    
    return json(updatedRun, { status: 200 });
  } else {
    // Create new run (stage start) 
    const insertStmt = db.prepare(`
      INSERT INTO runs (task_id, attempt, stage, agent, status, result, finished_at, duration_ms) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const info = insertStmt.run(
      params.id, attempt, stage, agent || null, status, result || null,
      status !== 'running' ? new Date().toISOString() : null,
      duration_ms || null
    );

    // Create start event
    const eventType = 'stage_start';
    const msg = `${stage} started`;
    db.prepare(`INSERT INTO events (task_id, type, message, agent) VALUES (?, ?, ?, ?)`).run(
      params.id, eventType, msg, agent
    );

    const newRun = db.prepare('SELECT * FROM runs WHERE id = ?').get(info.lastInsertRowid);
    return json(newRun, { status: 201 });
  }
};
```

### 2. Add PUT Endpoint for Explicit Updates

**File**: `src/routes/api/tasks/[id]/runs/+server.ts`

Add a dedicated PUT endpoint for updating existing runs:

```typescript
export const PUT: RequestHandler = async ({ params, request }) => {
  const db = getDb();
  const body = await request.json();
  const { attempt, stage, status, result, duration_ms } = body;

  if (!attempt || !stage || !status) {
    return json({ error: 'attempt, stage, and status are required' }, { status: 400 });
  }

  // Find the run to update
  const existingRun = db.prepare(`
    SELECT * FROM runs 
    WHERE task_id = ? AND attempt = ? AND stage = ?
  `).get(params.id, attempt, stage);

  if (!existingRun) {
    return json({ error: 'Run not found' }, { status: 404 });
  }

  // Update the run
  const updateStmt = db.prepare(`
    UPDATE runs SET 
      status = ?, 
      result = ?, 
      finished_at = ?, 
      duration_ms = ?
    WHERE id = ?
  `);
  
  updateStmt.run(
    status,
    result || null,
    status !== 'running' ? new Date().toISOString() : null,
    duration_ms || null,
    existingRun.id
  );
  
  const updatedRun = db.prepare('SELECT * FROM runs WHERE id = ?').get(existingRun.id);
  return json(updatedRun, { status: 200 });
};
```

### 3. Frontend Changes (Optional)

The existing UI in `src/routes/+page.svelte` should work correctly once the API stops creating duplicates, but verify the timeline sorts properly:

**File**: `src/routes/+page.svelte` (line ~360)

Current sorting (should remain unchanged):
```svelte
{#each selectedTask.runs.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()) as run}
```

**Verification needed:** Ensure the timeline shows runs in the correct order when there's only one record per stage.

## Testing Strategy

### 1. Database State Verification

Before fix:
```sql
SELECT task_id, attempt, stage, status, COUNT(*) as count 
FROM runs 
GROUP BY task_id, attempt, stage 
HAVING COUNT(*) > 1;
-- Should show duplicates
```

After fix:
```sql
SELECT task_id, attempt, stage, status, COUNT(*) as count 
FROM runs 
GROUP BY task_id, attempt, stage 
HAVING COUNT(*) > 1;
-- Should return no rows
```

### 2. API Testing

**Test Case 1: Stage Start**
```bash
curl -X POST http://localhost:5173/api/tasks/task-123/runs \
  -H "Content-Type: application/json" \
  -d '{
    "attempt": 1,
    "stage": "scout",
    "status": "running", 
    "agent": "scout"
  }'
```
**Expected:** HTTP 201, new Run record created

**Test Case 2: Stage Completion**  
```bash
curl -X POST http://localhost:5173/api/tasks/task-123/runs \
  -H "Content-Type: application/json" \
  -d '{
    "attempt": 1,
    "stage": "scout",
    "status": "passed",
    "result": "Spec created successfully",
    "duration_ms": 45000
  }'
```
**Expected:** HTTP 200, existing Run record updated

**Test Case 3: PUT Endpoint**
```bash
curl -X PUT http://localhost:5173/api/tasks/task-123/runs \
  -H "Content-Type: application/json" \
  -d '{
    "attempt": 1,
    "stage": "scout", 
    "status": "failed",
    "result": "Error: spec validation failed"
  }'
```
**Expected:** HTTP 200, Run record updated

### 3. UI Testing

1. **Create a new task** and start it
2. **Open task detail modal** while pipeline is running
3. **Verify single entries** for each active stage
4. **Wait for completion** and verify final status replaces "running"
5. **Check timeline order** remains chronological

## Migration Considerations

### Existing Data

The fix will only apply to **new pipeline runs**. Existing duplicate records will remain in the database but won't cause new duplication.

**Optional cleanup query:**
```sql
-- Find and remove duplicate "running" records that have a corresponding final result
DELETE FROM runs WHERE id IN (
  SELECT r1.id FROM runs r1
  JOIN runs r2 ON (
    r1.task_id = r2.task_id AND 
    r1.attempt = r2.attempt AND 
    r1.stage = r2.stage AND
    r1.status = 'running' AND 
    r2.status IN ('passed', 'failed') AND
    r1.id < r2.id
  )
);
```

### Backward Compatibility

- **API changes** are additive (PUT endpoint)
- **POST behavior change** may affect external callers
- **Consider versioning** if other systems call this API

## Implementation Priority

**HIGH PRIORITY**
- [x] Analyze current duplication behavior ✅
- [x] Document API modification approach ✅  
- [ ] Implement POST endpoint update logic
- [ ] Add PUT endpoint for explicit updates
- [ ] Test with sample data

**MEDIUM PRIORITY**  
- [ ] UI verification and testing
- [ ] Data migration for existing duplicates
- [ ] Performance optimization for large task histories

**LOW PRIORITY**
- [ ] API versioning for external consumers
- [ ] Enhanced error handling for edge cases

## Success Criteria

✅ **Fixed Duplication**: Each stage shows exactly one entry per attempt  
✅ **In-place Updates**: "running" status changes to final result without creating new rows  
✅ **Preserved Timeline**: Run history maintains chronological order  
✅ **Backward Compatible**: Existing UI continues working without changes  
✅ **Clean API**: Clear distinction between create (POST) and update (PUT) operations

---

**Ready for Implementation**: This spec provides all necessary details for the Builder agent to implement the fix.
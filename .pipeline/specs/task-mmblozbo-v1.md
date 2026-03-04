# Implementation Spec: Pipeline Run Duration Calculation & Display

**Task ID**: task-mmblozbo  
**Title**: Pipeline Runs: calculate and display duration  
**Project**: pipeline-dashboard  
**Stack**: node  
**Attempt**: 1  
**Date**: 2026-03-04

## Problem Analysis

### Current Issue
All pipeline run entries in the Pipeline page show "Duration: —" instead of meaningful duration information, even for completed runs.

### Root Cause Analysis

After analyzing the codebase, I identified the core issue:

#### 1. Missing Duration Calculation in Runs API
- **Location**: `/src/routes/api/tasks/[id]/runs/+server.ts` 
- **Issue**: The POST endpoint creates runs but never calculates `duration_ms`
- **Current Logic**: Only sets `finished_at` when status is not 'running', but never calculates the duration
- **Result**: All runs have `duration_ms = null`

#### 2. Partial Duration Calculation in Agents API  
- **Location**: `/src/routes/api/agents/+server.ts`
- **Issue**: Only calculates duration for tasks completed via "recently completed" mechanism
- **Problem**: Individual run completions bypass this logic
- **Result**: Only task-level completions get duration, not stage-level completions

#### 3. Frontend Logic Already Exists But Gets Null Data
- **Location**: `/src/routes/pipeline/+page.svelte` lines 18-23
- **Status**: ✅ Frontend `durationStr()` function works correctly
- **Issue**: Always receives `duration_ms = null` from database

### Current Database State
```sql
-- All existing runs have duration_ms = NULL
SELECT COUNT(*) FROM runs WHERE duration_ms IS NOT NULL; -- Returns 0
SELECT COUNT(*) FROM runs WHERE duration_ms IS NULL;     -- Returns all runs
```

## Implementation Plan

### Phase 1: Fix Runs API to Calculate Duration
**File**: `/src/routes/api/tasks/[id]/runs/+server.ts`

#### Current POST Logic (Problematic):
```typescript
const stmt = db.prepare(`INSERT INTO runs (task_id, attempt, stage, agent, status, result, finished_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
const info = stmt.run(
  params.id, attempt, stage, agent || null, status, result || null,
  status !== 'running' ? new Date().toISOString() : null,  // Sets finished_at
  duration_ms || null  // Always null since not calculated
);
```

#### New Logic Required:
```typescript
// Calculate duration when run completes
let calculatedDuration = duration_ms || null;
const finishedAt = status !== 'running' ? new Date().toISOString() : null;

if (finishedAt && status !== 'running') {
  // Find the existing run to get started_at
  const existingRun = db.prepare('SELECT started_at FROM runs WHERE task_id = ? AND stage = ? AND attempt = ? ORDER BY id DESC LIMIT 1').get(params.id, stage, attempt);
  
  if (existingRun?.started_at) {
    calculatedDuration = new Date(finishedAt).getTime() - new Date(existingRun.started_at).getTime();
  }
}

const stmt = db.prepare(`INSERT INTO runs (task_id, attempt, stage, agent, status, result, finished_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
const info = stmt.run(
  params.id, attempt, stage, agent || null, status, result || null,
  finishedAt,
  calculatedDuration
);
```

#### Issues with Current Approach:
The above approach has a fundamental flaw: runs are created only once, so we can't calculate duration by looking up an existing run.

#### Better Approach - Add PUT/PATCH Endpoint:
We need to support updating existing runs when they complete:

```typescript
// New PUT endpoint in the same file
export const PUT: RequestHandler = async ({ params, request }) => {
  const db = getDb();
  const body = await request.json();
  const { id, status, result } = body; // id is the run.id, not task_id

  if (!id || !status) {
    return json({ error: 'id and status are required' }, { status: 400 });
  }

  const finishedAt = new Date().toISOString();
  
  // Get the existing run to calculate duration
  const existingRun = db.prepare('SELECT started_at FROM runs WHERE id = ?').get(id);
  
  let duration_ms = null;
  if (existingRun?.started_at) {
    duration_ms = new Date(finishedAt).getTime() - new Date(existingRun.started_at).getTime();
  }

  // Update the run
  const stmt = db.prepare(`UPDATE runs SET status = ?, result = ?, finished_at = ?, duration_ms = ? WHERE id = ?`);
  stmt.run(status, result || null, finishedAt, duration_ms, id);

  // Auto-create event
  const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
  if (run) {
    const eventType = status === 'passed' ? 'stage_pass' : 'stage_fail';
    const msg = `${run.stage} ${status}${result ? ': ' + result.substring(0, 200) : ''}`;
    db.prepare(`INSERT INTO events (task_id, type, message, agent) VALUES (?, ?, ?, ?)`).run(run.task_id, eventType, msg, run.agent);
  }

  return json(run);
};
```

### Phase 2: Backfill Existing Runs
**File**: `/src/scripts/backfill-durations.js` (New migration script)

```javascript
import { getDb } from '../src/lib/db.js';

function backfillDurations() {
  const db = getDb();
  
  // Find all completed runs without duration
  const completedRuns = db.prepare(`
    SELECT id, started_at, finished_at 
    FROM runs 
    WHERE finished_at IS NOT NULL 
    AND duration_ms IS NULL 
    AND started_at IS NOT NULL
  `).all();
  
  console.log(`Found ${completedRuns.length} completed runs without duration`);
  
  const updateStmt = db.prepare('UPDATE runs SET duration_ms = ? WHERE id = ?');
  let updated = 0;
  
  for (const run of completedRuns) {
    const duration = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
    updateStmt.run(duration, run.id);
    updated++;
  }
  
  console.log(`Updated ${updated} runs with calculated durations`);
}

backfillDurations();
```

### Phase 3: Enhanced Time Utilities
**File**: `/src/lib/time-utils.ts`

Add human-readable duration formatting function:

```typescript
export function formatDuration(ms: number | null): string {
  if (!ms || ms < 0) return '—';
  
  if (ms < 1000) return `${ms}ms`;
  
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainingSeconds}s`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0 && remainingSeconds === 0) {
    return `${hours}h`;
  } else if (remainingSeconds === 0) {
    return `${hours}h ${remainingMinutes}m`;
  } else {
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
  }
}

export function formatRunStatus(run: Run): string {
  if (run.status === 'running') {
    return 'Running...';
  } else if (run.finished_at && run.started_at) {
    const duration = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
    return formatDuration(duration);
  } else {
    return '—';
  }
}
```

### Phase 4: Update Frontend to Handle Running State
**File**: `/src/routes/pipeline/+page.svelte`

#### Current Logic (Lines 18-23):
```typescript
function durationStr(ms: number | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}
```

#### Enhanced Logic:
```typescript
import { formatRunStatus } from '$lib/time-utils';

// Replace the durationStr function with:
function durationStr(run: any): string {
  return formatRunStatus(run);
}

// Update the template call from:
<span class="w-16 text-right text-text-dim">{durationStr(run.duration_ms)}</span>

// To:
<span class="w-16 text-right text-text-dim">{durationStr(run)}</span>
```

### Phase 5: Fix Agents API Duration Logic
**File**: `/src/routes/api/agents/+server.ts`

#### Current Logic (Line 134):
```typescript
db.prepare(
  "UPDATE runs SET status = 'passed', finished_at = ?, duration_ms = ? WHERE task_id = ? AND status = 'running'"
).run(now, matchingCompleted.runtimeMs, task.id);
```

#### Issue & Fix:
- **Problem**: `matchingCompleted.runtimeMs` is task runtime, not individual run duration
- **Fix**: Calculate actual run duration for each run individually

```typescript
// Get all running runs for this task
const runningRuns = db.prepare(
  "SELECT id, started_at FROM runs WHERE task_id = ? AND status = 'running'"
).all(task.id) as Array<{id: number, started_at: string}>;

for (const run of runningRuns) {
  const duration = new Date(now).getTime() - new Date(run.started_at).getTime();
  db.prepare(
    "UPDATE runs SET status = 'passed', finished_at = ?, duration_ms = ? WHERE id = ?"
  ).run(now, duration, run.id);
}
```

## Files to Modify

### 1. `/src/routes/api/tasks/[id]/runs/+server.ts`
- **Changes**: Add PUT endpoint for updating runs
- **Risk Level**: Low (additive change)
- **Testing**: API integration tests

### 2. `/src/lib/time-utils.ts`
- **Changes**: Add duration formatting functions  
- **Risk Level**: Very Low (pure utility functions)
- **Testing**: Unit tests

### 3. `/src/routes/pipeline/+page.svelte`
- **Changes**: Update duration display logic
- **Risk Level**: Low (display only)
- **Testing**: Visual regression testing

### 4. `/src/routes/api/agents/+server.ts`
- **Changes**: Fix duration calculation for bulk task completion
- **Risk Level**: Medium (affects existing logic)
- **Testing**: Integration tests with agent completion flow

### 5. `/src/scripts/backfill-durations.js` (New)
- **Changes**: Create migration script for existing data
- **Risk Level**: Low (one-time script)
- **Testing**: Manual verification on dev database

## Testing Strategy

### Unit Tests
```typescript
// src/lib/time-utils.test.ts
import { describe, it, expect } from 'vitest';
import { formatDuration, formatRunStatus } from './time-utils';

describe('Duration formatting', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });
  
  it('formats seconds', () => {
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(45000)).toBe('45s');
  });
  
  it('formats minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(120000)).toBe('2m');
  });
  
  it('formats hours', () => {
    expect(formatDuration(3600000)).toBe('1h');
    expect(formatDuration(3660000)).toBe('1h 1m');
    expect(formatDuration(3665000)).toBe('1h 1m 5s');
  });
  
  it('handles null and negative values', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(-1000)).toBe('—');
  });
});

describe('Run status formatting', () => {
  it('shows running state', () => {
    expect(formatRunStatus({status: 'running'})).toBe('Running...');
  });
  
  it('calculates duration for completed runs', () => {
    const run = {
      status: 'passed',
      started_at: '2026-03-04T00:00:00.000Z',
      finished_at: '2026-03-04T00:02:30.000Z'
    };
    expect(formatRunStatus(run)).toBe('2m 30s');
  });
});
```

### Integration Tests
```typescript
// Test runs API
describe('Runs API', () => {
  it('calculates duration when updating run status', async () => {
    // Create a run
    const createRes = await POST('/api/tasks/test-task/runs', {
      attempt: 1, stage: 'scout', status: 'running'
    });
    const run = await createRes.json();
    
    // Update run to completed
    const updateRes = await PUT('/api/tasks/test-task/runs', {
      id: run.id, status: 'passed'
    });
    const updatedRun = await updateRes.json();
    
    expect(updatedRun.duration_ms).toBeGreaterThan(0);
    expect(updatedRun.finished_at).toBeTruthy();
  });
});
```

### Manual Testing Checklist
- [ ] Create new task run → duration shows "Running..."
- [ ] Complete the run → duration shows calculated time  
- [ ] Run backfill script → existing runs show durations
- [ ] Check pipeline page → all durations display correctly
- [ ] Verify bulk task completion → individual run durations calculated

## Expected Behavior After Implementation

### For New Runs:
- ✅ Running runs show "Running..." instead of "—"
- ✅ Completed runs show actual calculated duration ("5s", "2m 30s", etc.)
- ✅ Duration calculation is accurate to the millisecond

### For Existing Runs (After Backfill):
- ✅ Historical completed runs show calculated durations
- ✅ Incomplete/broken runs continue to show "—"

### API Behavior:
- ✅ POST `/api/tasks/[id]/runs` creates runs with `started_at`
- ✅ PUT `/api/tasks/[id]/runs` updates runs with calculated duration
- ✅ Bulk task completion updates individual run durations correctly

## Performance Considerations

### Database Impact
- **Minimal**: Duration calculation is simple arithmetic
- **Index**: Existing indexes on task_id and status are sufficient
- **Storage**: `duration_ms` field already exists in schema

### Frontend Impact  
- **Minimal**: Pure display formatting changes
- **No API calls**: Uses existing run data
- **Rendering**: No performance change in UI loops

## Rollback Plan

### If Issues Arise:
1. **Revert frontend changes**: Restore original `durationStr()` function
2. **Disable PUT endpoint**: Comment out new endpoint temporarily  
3. **Database**: Duration calculations are non-destructive (only fill null values)

### Emergency Rollback:
```sql
-- If needed, reset all durations to null
UPDATE runs SET duration_ms = NULL WHERE duration_ms IS NOT NULL;
```

## Security Considerations

### API Security
- ✅ PUT endpoint requires same task ownership as existing POST
- ✅ No new authentication/authorization needed
- ✅ Input validation consistent with existing patterns

### Data Integrity
- ✅ Duration calculation is deterministic and reversible
- ✅ No destructive changes to existing data
- ✅ Backfill script is idempotent

## Success Metrics

### User Experience
- Users can see how long each pipeline stage took
- Clear distinction between "running" and "completed" states
- Historical runs show meaningful time data

### Technical Metrics
- ✅ **AC1**: New runs calculate duration when completed
- ✅ **AC2**: Running runs display "Running..." instead of "—"  
- ✅ **AC3**: Completed runs display human-readable duration ("5s", "2m 30s")
- ✅ **AC4**: Existing runs backfilled with calculated durations
- ✅ **AC5**: Bulk task completion preserves individual run durations
- ✅ **AC6**: API supports updating run completion status
- ✅ **AC7**: Duration formatting handles edge cases (ms, hours, null)
- ✅ **AC8**: No performance regression in pipeline page rendering
- ✅ **AC9**: Database schema unchanged (uses existing fields)
- ✅ **AC10**: Backward compatibility maintained

## Dependencies

- ✅ No external dependencies required
- ✅ No database schema changes needed  
- ✅ No new npm packages required
- ✅ Uses existing SvelteKit and better-sqlite3 infrastructure

## Timeline Estimate

- **Phase 1** (Runs API): 2-3 hours
- **Phase 2** (Backfill script): 1 hour
- **Phase 3** (Time utilities): 1 hour  
- **Phase 4** (Frontend updates): 1-2 hours
- **Phase 5** (Agents API fix): 1-2 hours
- **Testing**: 2-3 hours
- **Total**: 8-12 hours

---

**Spec Version**: v1  
**Date**: 2026-03-04  
**Author**: Scout Agent  
**Status**: Ready for Implementation  
**Complexity**: Medium  
**Risk Level**: Low-Medium
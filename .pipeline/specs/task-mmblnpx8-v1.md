# Implementation Specification: Complete Column Sort Order Fix

**Task ID:** task-mmblnpx8  
**Version:** 1  
**Date:** 2026-03-04  
**Stage:** Scout  

## Problem Analysis

The "COMPLETE" column on the tasks page currently sorts tasks alphabetically/by priority instead of showing the newest completed tasks on top. This makes it difficult to track recent task completions.

### Current Behavior
- All tasks are sorted globally using: `ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, updated_at DESC`
- The Complete column shows tasks with statuses: `['done', 'failed', 'paused']`
- Completed tasks appear in priority order, not completion time order

### Expected Behavior
- Complete column should show newest completed tasks first
- Sort order should be by `completed_at DESC` for completed tasks
- Other columns can maintain current sorting

## Technical Investigation

### Codebase Structure
- **Main Dashboard:** `src/routes/+page.svelte` (SvelteKit app)
- **Data Loading:** `src/routes/+page.server.ts` 
- **Database Schema:** `src/lib/db.ts` - tasks table has `completed_at DATETIME` field
- **Task Updates:** `src/routes/api/tasks/[id]/+server.ts` PATCH endpoint supports `completed_at`

### Current Implementation
```typescript
// In +page.server.ts
const tasks = db.prepare(`
    SELECT tasks.*, projects.name as project_name, projects.slug as project_slug, projects.stack_type as project_stack_type 
    FROM tasks 
    LEFT JOIN projects ON tasks.project_id = projects.id
    ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, updated_at DESC
`).all() as Task[];

// In +page.svelte  
const complete = $derived(data.tasks.filter((t: Task) => ['done', 'failed', 'paused'].includes(t.status)));
```

## Implementation Plan

### Option 1: Client-Side Sorting (Recommended)
**Pros:** Minimal impact, preserves other sorting, easy to implement  
**Cons:** Slight client-side overhead  

Modify `src/routes/+page.svelte` to sort the complete column specifically:

```typescript
const complete = $derived(
    data.tasks
        .filter((t: Task) => ['done', 'failed', 'paused'].includes(t.status))
        .sort((a, b) => {
            // Sort by completed_at DESC, fallback to updated_at DESC if no completed_at
            const aDate = a.completed_at ? new Date(a.completed_at) : new Date(a.updated_at);
            const bDate = b.completed_at ? new Date(b.completed_at) : new Date(b.updated_at);
            return bDate.getTime() - aDate.getTime();
        })
);
```

### Option 2: Server-Side Conditional Sorting
**Pros:** More efficient, handles sorting at database level  
**Cons:** More complex SQL, potential impact on other functionality  

Modify the SQL query in `src/routes/+page.server.ts` to use conditional ordering:

```sql
SELECT tasks.*, projects.name as project_name, projects.slug as project_slug, projects.stack_type as project_stack_type 
FROM tasks 
LEFT JOIN projects ON tasks.project_id = projects.id
ORDER BY 
    CASE 
        WHEN status IN ('done', 'failed', 'paused') THEN 
            CASE WHEN completed_at IS NOT NULL THEN completed_at ELSE updated_at END
        ELSE 
            CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END
    END DESC,
    CASE WHEN status NOT IN ('done', 'failed', 'paused') THEN updated_at END DESC
```

## Critical Implementation Details

### 1. Ensure `completed_at` is Set
**Issue:** The `completed_at` field might not be automatically set when tasks transition to completed states.

**Investigation Required:** Check if there's logic that sets `completed_at` when task status changes to `done`, `failed`, or `paused`.

**Potential Fix:** Add automatic `completed_at` setting in task status transitions:

```typescript
// In PATCH handler or wherever task status is updated
if (['done', 'failed', 'paused'].includes(newStatus) && !body.completed_at) {
    body.completed_at = new Date().toISOString();
}
```

### 2. Handle Missing `completed_at` Values
For tasks that were completed before this fix, `completed_at` might be null.

**Fallback Strategy:** Use `updated_at` when `completed_at` is null in the sorting logic.

### 3. Database Migration (if needed)
If many existing completed tasks have null `completed_at`, consider a one-time migration:

```sql
UPDATE tasks 
SET completed_at = updated_at 
WHERE status IN ('done', 'failed', 'paused') 
AND completed_at IS NULL;
```

## Testing Strategy

### Test Cases
1. **New Completions:** Create tasks, complete them in sequence, verify Complete column shows newest first
2. **Mixed Completion Times:** Tasks completed at different times should sort correctly
3. **Missing completed_at:** Tasks with null `completed_at` should fall back to `updated_at`
4. **Other Columns:** Verify Backlog, In Progress, Review columns still sort correctly
5. **Priority Override:** Within same completion time, verify priority still matters (if desired)

### Manual Test Steps
1. Complete several tasks with different completion times
2. Refresh the dashboard
3. Verify Complete column shows most recently completed tasks at the top
4. Check that clicking between columns preserves individual sorting

## Files to Modify

### Primary Changes
- `src/routes/+page.svelte` - Update `complete` derived value with sorting logic

### Secondary Changes (if Option 2 chosen)
- `src/routes/+page.server.ts` - Modify SQL query for conditional sorting

### Potential Additional Changes
- `src/routes/api/tasks/[id]/+server.ts` - Ensure `completed_at` is set on status transitions
- Add database migration script if needed for existing data

## Risk Assessment

**Low Risk:** Client-side sorting (Option 1) has minimal impact  
**Medium Risk:** Server-side changes could affect performance or other features  
**Data Risk:** Missing `completed_at` values could cause incorrect ordering  

## Success Criteria

✅ Complete column shows newest completed tasks first  
✅ Other columns maintain current sorting behavior  
✅ No performance degradation  
✅ Handles edge cases (missing completed_at values)  
✅ Works across different task statuses (done, failed, paused)

## Next Steps for Builder Stage

1. Choose implementation approach (recommend Option 1 for safety)
2. Implement the sorting fix
3. Test with existing data to verify completed_at field population  
4. Add automatic completed_at setting if missing
5. Run manual tests to verify functionality
6. Consider adding visual indicator for completion time in UI
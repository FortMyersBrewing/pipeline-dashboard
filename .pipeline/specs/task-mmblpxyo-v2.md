# Implementation Spec: Pipeline Runs - Collapse Running + Result Into Single Entry

**Task ID:** mmblpxyo-v2  
**Stage:** Scout → Builder  
**Created:** 2025-03-04  

## Problem Analysis

### Current Issue
In the task detail modal, the Pipeline Runs section shows **two entries per stage per attempt**:
1. One entry with `status: 'running'` when the stage starts
2. Another entry with `status: 'passed'` or `status: 'failed'` when the stage completes

This creates visual clutter and confusion - users see duplicate timeline entries for each stage.

### Root Cause
**File:** `src/routes/+page.svelte` (lines ~512-547)

```svelte
{#each selectedTask.runs.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()) as run}
    <div class="flex gap-4">
        <!-- Timeline entry for EVERY run record -->
    </div>
{/each}
```

The code iterates through ALL run records without consolidation. When a stage executes:
1. Pipeline creates a `Run` record with `status: 'running'`
2. When stage completes, pipeline creates a **second** `Run` record with final status
3. Modal shows both records as separate timeline entries

### Data Structure
From `src/lib/types.ts`:
```typescript
export interface Run {
    id: number;
    task_id: string;
    attempt: number;    // Groups runs by retry attempt
    stage: string;      // scout, builder, gatekeeper, reviewer, qa
    agent: string | null;
    status: string;     // 'running', 'passed', 'failed'
    result: string | null;
    started_at: string;
    finished_at: string | null;
    duration_ms: number | null;
}
```

Each `(stage, attempt)` combination can have multiple `Run` records with different statuses.

## Solution Design

### Goal
Show **one entry per stage per attempt** that:
- Displays `'running'` while stage is active
- **Updates in place** to show final status (`'passed'`/`'failed'`) when complete
- Preserves all functionality (timing, results, agent info)

### Implementation Approach

**1. Data Consolidation**
Group runs by `(stage, attempt)` and select the latest status for each group.

**2. UI Updates**
The timeline should show:
- **While running:** Icon + "Running" badge + start time
- **When complete:** Same icon + "Passed/Failed" badge + duration + result

**3. Progressive Enhancement**
Use the existing UI structure but feed it consolidated data instead of raw run records.

## Implementation Plan

### Step 1: Create Run Consolidation Function

**Location:** `src/routes/+page.svelte` (around line 180, with other utility functions)

```javascript
function consolidateRuns(runs: Run[]): Run[] {
    if (!runs || runs.length === 0) return [];
    
    // Group by (stage, attempt)
    const grouped = new Map<string, Run[]>();
    
    for (const run of runs) {
        const key = `${run.stage}-${run.attempt}`;
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key)!.push(run);
    }
    
    // For each group, return the latest status
    const consolidated: Run[] = [];
    
    for (const [key, groupRuns] of grouped) {
        // Sort by started_at descending to get latest
        groupRuns.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
        
        const latestRun = groupRuns[0];
        
        // If latest is 'running', check if there's a newer completed run
        if (latestRun.status === 'running') {
            const completedRun = groupRuns.find(r => r.status === 'passed' || r.status === 'failed');
            if (completedRun) {
                // Use completed run but preserve timing from running run if needed
                consolidated.push({
                    ...completedRun,
                    started_at: groupRuns[groupRuns.length - 1].started_at // earliest start time
                });
            } else {
                consolidated.push(latestRun);
            }
        } else {
            // Use the latest completed run
            consolidated.push({
                ...latestRun,
                started_at: groupRuns[groupRuns.length - 1].started_at // earliest start time
            });
        }
    }
    
    return consolidated;
}
```

### Step 2: Update Template

**Location:** `src/routes/+page.svelte` (lines ~512-547)

**BEFORE:**
```svelte
{#each selectedTask.runs.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()) as run}
```

**AFTER:**
```svelte
{#each consolidateRuns(selectedTask.runs || []).sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()) as run}
```

### Step 3: Enhance Status Display (Optional)

For better UX, consider adding visual indication of consolidation:

```svelte
<!-- In the run details section -->
<div class="flex items-center gap-2 mb-1">
    <span class="text-sm font-medium text-text">{STAGE_LABELS[run.stage] || run.stage}</span>
    <span class="text-xs px-2 py-0.5 rounded-full {getRunStatusColor(run.status)}">
        {run.status}
    </span>
    {#if run.agent}
        <span class="text-xs text-text-dim">by {run.agent}</span>
    {/if}
    
    <!-- Optional: Show if this was consolidated from multiple runs -->
    <!-- This would require tracking that in consolidateRuns() -->
</div>
```

## Testing Plan

### Test Cases

**1. Single Stage Execution**
- Start a task with 1 stage
- Verify only 1 timeline entry appears
- Verify it shows "running" → updates to "passed/failed" in place

**2. Multi-Stage Pipeline**
- Run a full 5-stage pipeline  
- Verify 5 timeline entries (not 10)
- Verify proper timing and result display

**3. Failed/Retry Scenarios**
- Run a task that fails and retries
- Verify attempt separation works correctly
- Verify failed attempts show final failure status

**4. Edge Cases**
- Task with no runs → shows "No pipeline runs yet"
- Task with only "running" runs → shows running status
- Mixed statuses within same attempt → shows latest

### Validation

Before deployment:
1. **Visual Check:** Open several task detail modals, verify single entries per stage
2. **Functionality Check:** Verify all existing features work (timing, results, agent info)
3. **Data Integrity:** Ensure no information is lost in consolidation

## Backwards Compatibility

This change is **fully backward compatible**:
- ✅ No database schema changes
- ✅ No API changes  
- ✅ No breaking changes to existing functionality
- ✅ Pure frontend improvement

## Files to Modify

**Primary Change:**
- `src/routes/+page.svelte` 
  - Add `consolidateRuns()` function (line ~180)
  - Update template `{#each}` loop (line ~512)

**No other files require changes.**

## Success Criteria

✅ **Visual:** Pipeline Runs shows exactly one entry per stage per attempt  
✅ **Functional:** All existing functionality preserved (timing, results, agents)  
✅ **UX:** Timeline is cleaner and less confusing  
✅ **Performance:** No noticeable performance impact  

## Risk Assessment

**Low Risk** - This is a pure frontend display change that:
- Does not modify any data persistence
- Does not change APIs or backend logic  
- Only affects the Pipeline Runs section of task detail modal
- Can be easily reverted if issues arise

---

**Next Stage:** Builder (implement the consolidation function and template updates)
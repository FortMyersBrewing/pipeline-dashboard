# Pipeline Runs: Collapse Running + Result into Single Entry

**Task ID:** mmblpxyo  
**Version:** 3  
**Created:** 2026-03-04

## Problem Analysis

**Root Cause:** The task detail modal's "Pipeline Runs" section displays duplicate entries because each pipeline stage creates multiple database records:
1. Initial record when stage starts (status: "running") 
2. Final record when stage completes (status: "passed"/"failed")

**Current Behavior:**
- UI renders ALL run records from `selectedTask.runs` without consolidation
- Results in two entries per stage per attempt
- Creates confusing duplicate timeline entries

**Desired Behavior:**
- Show only ONE entry per stage per attempt
- While running: display "running" status
- When complete: replace in-place with final status ("passed"/"failed") and show result text
- Clean, single-row timeline per stage execution

## Current Implementation (src/routes/+page.svelte)

**Lines 417-457:** Pipeline Runs section in task detail modal

```svelte
{#if selectedTask.runs && selectedTask.runs.length > 0}
  <div class="space-y-4">
    {#each selectedTask.runs.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()) as run}
      <!-- Shows ALL run records individually -->
      <div class="flex gap-4">
        <!-- Timeline display for each run -->
      </div>
    {/each}
  </div>
```

**Problem:** This iterates over every run record, creating separate UI entries for "running" and final status.

## Solution: Client-Side Run Consolidation

### Step 1: Create Derived Consolidation Logic

Add consolidation function before the modal markup:

```svelte
<script>
  // ... existing code ...

  // Consolidate runs: one entry per (attempt, stage) showing latest status
  function consolidateRuns(runs: Run[] | undefined): Run[] {
    if (!runs || runs.length === 0) return [];
    
    // Group runs by attempt + stage
    const groups = new Map<string, Run[]>();
    
    for (const run of runs) {
      const key = `${run.attempt}-${run.stage}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(run);
    }
    
    // For each group, return only the latest run (by started_at)
    const consolidated: Run[] = [];
    for (const [, groupRuns] of groups) {
      // Sort by started_at desc, take most recent
      const latest = groupRuns.sort((a, b) => 
        new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      )[0];
      consolidated.push(latest);
    }
    
    // Sort final results by started_at desc for display
    return consolidated.sort((a, b) => 
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    );
  }

  // Derived consolidated runs for current task
  const consolidatedRuns = $derived(
    selectedTask ? consolidateRuns(selectedTask.runs) : []
  );
</script>
```

### Step 2: Update Template to Use Consolidated Data

Replace the existing `{#each selectedTask.runs.sort(...)` loop:

```svelte
<!-- BEFORE (lines 417-457) -->
{#if selectedTask.runs && selectedTask.runs.length > 0}
  <div class="space-y-4">
    {#each selectedTask.runs.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()) as run}
      <!-- ... existing run display ... -->
    {/each}
  </div>

<!-- AFTER -->
{#if consolidatedRuns.length > 0}
  <div class="space-y-4">
    {#each consolidatedRuns as run}
      <!-- ... same run display markup ... -->
    {/each}
  </div>
```

### Step 3: Enhance Status Display

Update the status display logic to better handle "running" states:

```svelte
<!-- In the run details section -->
<div class="flex items-center gap-2 mb-1">
  <span class="text-sm font-medium text-text">{STAGE_LABELS[run.stage] || run.stage}</span>
  <span class="text-xs px-2 py-0.5 rounded-full {getRunStatusColor(run.status)}">
    {run.status}
    {#if run.status === 'running'}
      <span class="ml-1 animate-pulse">●</span>
    {/if}
  </span>
  {#if run.agent}
    <span class="text-xs text-text-dim">by {run.agent}</span>
  {/if}
</div>
```

## Implementation Files

### Primary File: `/src/routes/+page.svelte`

**Changes Required:**

1. **Add consolidation function** (around line 130, after existing helper functions)
2. **Add derived state** (around line 140, with other derived values)  
3. **Update template** (lines 417-457, replace `selectedTask.runs` with `consolidatedRuns`)
4. **Optional: enhance running state display** (visual polish)

**No other files need modification.** This is a client-side display fix only.

## Expected Behavior After Fix

**Before:**
- Scout stage: "running" entry
- Scout stage: "passed" entry with result text  
- Builder stage: "running" entry
- Builder stage: "failed" entry with error text
- *(4 total entries for 2 stages)*

**After:**
- Scout: "passed" with result text
- Builder: "failed" with error text  
- *(2 total entries for 2 stages)*

Running stages will show "running" until they complete, then replace in-place with final status.

## Testing

1. Open task detail modal for active task
2. Verify only one entry per stage per attempt
3. Confirm running stages show "running" status with pulse animation
4. Verify completed stages show final status and result text
5. Check that attempt numbers are preserved correctly

## Technical Notes

- **Data Integrity:** Database remains unchanged; this is UI-only consolidation
- **Performance:** Minimal impact; consolidation runs once per task selection
- **Backward Compatibility:** No breaking changes; enhanced display only
- **Auto-refresh:** Consolidation runs on each data refresh, handles real-time updates

## Risk Assessment

**Low Risk:**
- Client-side only change
- No database modifications  
- Existing functionality preserved
- Easy to rollback if needed

The fix specifically targets the duplication issue while maintaining all existing data and functionality.
# Task Implementation Spec: Fix Timestamp Display

**Task ID:** mmbi4ecm-v1  
**Title:** Log times - everywhere  
**Date:** 2026-03-03  
**Stack:** SvelteKit 5 + TypeScript + Tailwind v4 + better-sqlite3

## Problem Statement

All timestamp displays in the dashboard currently show "just now" and never update to show actual human-readable dates. Need to replace relative time formatting with absolute date/time format: `YYYY.M.D HH:mm` (e.g., `2026.3.3 22:15`).

## Files Requiring Changes

### 1. `/src/routes/+page.svelte` (Main Dashboard)
**Current `timeAgo` function (lines 47-53):**
```javascript
function timeAgo(date: string): string {
    const ms = Date.now() - new Date(date).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
}
```

**Usage locations:**
- Line ~138: `{timeAgo(task.updated_at)}` (task card timestamps)
- Line ~187: `{timeAgo(selectedTask.updated_at)}` (task detail modal)

**Additional timestamp displays:**
- Line ~186: `{new Date(selectedTask.created_at).toLocaleDateString()}` (task detail modal created date)
- Line ~210: `{new Date(run.started_at).toLocaleString()}` (run timeline in modal)

### 2. `/src/routes/pipeline/+page.svelte` (Pipeline View)
**Current `timeAgo` function (lines 12-18):**
```javascript
function timeAgo(date: string): string {
    const ms = Date.now() - new Date(date).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
}
```

**Usage locations:**
- Line ~85: `{timeAgo(run.started_at)}` (pipeline run timestamps)

### 3. `/src/routes/activity/+page.svelte` (Activity Feed)
**Current `timeAgo` function (lines 9-15):**
```javascript
function timeAgo(date: string): string {
    const ms = Date.now() - new Date(date).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
}
```

**Usage locations:**
- Line ~33: `{timeAgo(event.created_at)}` (activity event timestamps)

### 4. `/src/routes/projects/+page.svelte` (Projects View)
**Current `timeAgo` function (lines 8-14):**
```javascript
function timeAgo(date: string): string {
    const ms = Date.now() - new Date(date).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
}
```

**Usage locations:**
- Line ~42: `{timeAgo(project.updated_at)}` (project card timestamps)

### 5. `/src/routes/+layout.svelte` (Global Layout)
**Current `timeAgo` function (lines 30-36):**
```javascript
function timeAgo(date: string): string {
    const ms = Date.now() - new Date(date).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
}
```

**Usage locations:**
- Line ~63: `{timeAgo(event.created_at)}` (global activity sidebar timestamps)

## Proposed Solution

### 1. Create Shared Utility Function
**File:** `/src/lib/time-utils.ts`
```typescript
export function formatTimestamp(date: string | Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1; // 0-indexed, so add 1
    const day = d.getDate();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    
    return `${year}.${month}.${day} ${hours}:${minutes}`;
}
```

### 2. Replace All `timeAgo` Functions

In each file listed above:

1. **Import the utility:**
```javascript
import { formatTimestamp } from '$lib/time-utils';
```

2. **Remove the existing `timeAgo` function**

3. **Replace all `timeAgo(...)` calls with `formatTimestamp(...)`**

4. **Update other date formatting calls:**
   - Replace `new Date(selectedTask.created_at).toLocaleDateString()` with `formatTimestamp(selectedTask.created_at)`
   - Replace `new Date(run.started_at).toLocaleString()` with `formatTimestamp(run.started_at)`

### 3. Special Cases to Address

**File:** `/src/routes/agents/+page.svelte`  
**Line:** `{agent.totalTokens.toLocaleString()}`  
This is not a timestamp - it's token count formatting. **No change needed.**

## Implementation Steps

1. Create `/src/lib/time-utils.ts` with the `formatTimestamp` function
2. Update `/src/routes/+page.svelte`:
   - Add import
   - Remove `timeAgo` function
   - Replace 4 timestamp display calls
3. Update `/src/routes/pipeline/+page.svelte`:
   - Add import
   - Remove `timeAgo` function  
   - Replace 1 timestamp display call
4. Update `/src/routes/activity/+page.svelte`:
   - Add import
   - Remove `timeAgo` function
   - Replace 1 timestamp display call
5. Update `/src/routes/projects/+page.svelte`:
   - Add import
   - Remove `timeAgo` function
   - Replace 1 timestamp display call
6. Update `/src/routes/+layout.svelte`:
   - Add import
   - Remove `timeAgo` function
   - Replace 1 timestamp display call

## Testing

1. Verify all timestamp displays show format `YYYY.M.D HH:mm`
2. Check that timestamps update correctly after page refresh
3. Ensure no "just now" text appears anywhere
4. Confirm token counts (non-timestamp numbers) still display correctly

## Expected Outcome

All timestamp displays will show human-readable absolute dates in the format `2026.3.3 22:15` instead of relative time like "just now", "5m ago", etc.

## Files Summary

- **Create:** 1 new file (`/src/lib/time-utils.ts`)
- **Modify:** 5 existing files (main dashboard, pipeline, activity, projects, layout)
- **Total changes:** Remove 5 duplicate functions, add 1 shared utility, update ~8 function calls

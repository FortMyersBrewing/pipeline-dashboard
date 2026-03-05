# Pipeline Launch Wizard - Implementation Spec

**Task ID:** 22ab313f-7a95-43b1-974f-0a69694ac447  
**Author:** Pipeline Coordinator Agent  
**Date:** 2026-03-04  
**Project:** Pipeline Dashboard  
**Phase:** 3 - Pipeline Launch Wizard

## Overview

Implement a comprehensive Pipeline Launch Wizard that allows users to launch build tasks directly from the project detail page with context bundling, live tracking, and task management controls.

## Current State Analysis

**Already Implemented:**
- Project detail page with overview, docs, kanban, activity tabs
- Document management system with CRUD operations
- Task kanban board with drag-and-drop
- Project CRUD operations with GitHub integration
- File browser API (`/api/project-files`)
- Task start endpoint (`/api/tasks/{id}/start`) that fires webhook

**Missing for Phase 3:**
- Pipeline Launch Wizard modal
- Context Assembly API
- Live pipeline tracking with auto-refresh
- Task detail expansion modal
- Pause/cancel/retry controls
- Launch button integration

## Implementation Requirements

### 1. Pipeline Launch Wizard Modal

**Component:** `src/lib/components/PipelineLaunchWizard.svelte`

**Steps:**
1. **What to Build** - Task configuration
2. **Context Bundling** - Select docs and files  
3. **Configuration** - Priority, attempts, branch strategy
4. **Review & Launch** - Summary and execution

**Props:**
```typescript
interface PipelineLaunchWizardProps {
  projectId: string;
  projectDocs: ProjectDoc[];
  visible: boolean;
  onClose: () => void;
  onLaunch: (tasks: LaunchTaskRequest[]) => Promise<void>;
}
```

**State Management:**
```typescript
interface WizardState {
  currentStep: 1 | 2 | 3 | 4;
  tasks: TaskFormData[];
  selectedDocs: number[];
  selectedFiles: string[];
  config: LaunchConfig;
  contextPreview: string;
  tokenEstimate: number;
  isLaunching: boolean;
}

interface TaskFormData {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

interface LaunchConfig {
  maxAttempts: number;
  branchStrategy: 'main' | 'feature' | 'custom';
  customBranch?: string;
}
```

### 2. Context Assembly API

**Endpoint:** `POST /api/projects/[id]/assemble-context`

**Request:**
```typescript
interface AssembleContextRequest {
  doc_ids: number[];
  file_paths: string[];
}
```

**Response:**
```typescript
interface AssembleContextResponse {
  context: string;
  token_estimate: number;
  included_docs: { id: number; title: string; type: string }[];
  included_files: { path: string; size: number }[];
}
```

**Implementation Logic:**
1. Fetch selected documents from `project_docs` table
2. Read selected files from project directory
3. Assemble into structured markdown context
4. Calculate token estimate (chars / 4)
5. Return bundled context with metadata

### 3. Live Pipeline Tracking

**Component:** `src/lib/components/LivePipelineTracker.svelte`

**Features:**
- Real-time stage progress visualization
- Auto-refresh every 5 seconds for active tasks
- Visual progress indicators for each pipeline stage
- Integration with existing pipeline visualization from main page

**Props:**
```typescript
interface LivePipelineTrackerProps {
  projectId: string;
  activeTasks: Task[];
  onTaskUpdate: (task: Task) => void;
}
```

### 4. Task Detail Expansion Modal

**Component:** `src/lib/components/TaskDetailModal.svelte`

**Features:**
- Full task description display
- Stage progress with timestamps
- Run history with logs
- Events timeline
- Bundled context viewer
- Specs viewer with versions

**Props:**
```typescript
interface TaskDetailModalProps {
  task: Task | null;
  visible: boolean;
  onClose: () => void;
  onAction: (action: TaskAction, taskId: string) => void;
}
```

### 5. Task Management Controls

**Component:** `src/lib/components/TaskControls.svelte`

**Actions:**
- Pause active task
- Cancel queued/active task
- Retry from specific stage
- View logs
- Download specs

**API Extensions:**
- `POST /api/tasks/{id}/pause`
- `POST /api/tasks/{id}/cancel`
- `POST /api/tasks/{id}/retry`

### 6. Launch Button Integration

**Location:** Project detail page header + kanban board quick actions

**Behavior:**
- Opens Pipeline Launch Wizard modal
- Disabled if no project docs/files available
- Shows tooltip with context about pipeline launching

## File Structure

```
src/lib/components/
├── pipeline/
│   ├── PipelineLaunchWizard.svelte
│   ├── WizardStep1Tasks.svelte
│   ├── WizardStep2Context.svelte
│   ├── WizardStep3Config.svelte
│   ├── WizardStep4Review.svelte
│   ├── LivePipelineTracker.svelte
│   ├── TaskDetailModal.svelte
│   ├── TaskControls.svelte
│   ├── ContextPreview.svelte
│   └── FileBrowser.svelte

src/routes/api/projects/[id]/
├── assemble-context/
│   └── +server.ts
├── launch/
│   └── +server.ts

src/routes/api/tasks/[id]/
├── pause/
│   └── +server.ts
├── cancel/
│   └── +server.ts
└── retry/
    └── +server.ts
```

## Database Schema Updates

```sql
-- Add task context storage
ALTER TABLE tasks ADD COLUMN bundled_context TEXT;
ALTER TABLE tasks ADD COLUMN context_docs TEXT; -- JSON array of doc IDs
ALTER TABLE tasks ADD COLUMN context_files TEXT; -- JSON array of file paths
ALTER TABLE tasks ADD COLUMN branch_strategy TEXT DEFAULT 'main';

-- Task actions log
CREATE TABLE IF NOT EXISTS task_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- 'pause', 'cancel', 'retry', 'start'
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/projects/[id]/assemble-context` | Bundle docs/files into context |
| `POST` | `/api/projects/[id]/launch` | Create and start tasks from wizard |
| `POST` | `/api/tasks/[id]/pause` | Pause active task |
| `POST` | `/api/tasks/[id]/cancel` | Cancel queued/active task |
| `POST` | `/api/tasks/[id]/retry` | Retry from specific stage |

## UI/UX Requirements

**Design System:**
- Use existing Tailwind dark theme
- Consistent with current dashboard styling
- Smooth transitions between wizard steps
- Visual feedback for all async operations

**Responsiveness:**
- Modal adapts to screen size
- File browser works on mobile
- Touch-friendly controls

**Performance:**
- Lazy load file browser contents
- Debounced search in file selection
- Efficient context assembly for large documents

## Integration Points

**Existing Components:**
- Reuse `MarkdownEditor` for context preview
- Extend `KanbanBoard` with quick launch actions
- Integrate with existing task refresh system

**API Compatibility:**
- All new endpoints follow existing patterns
- Error handling consistent with current API
- Database operations use existing `getDb()` helper

## Implementation Order

1. **Context Assembly API** - Foundation for bundling
2. **Wizard Step Components** - UI building blocks  
3. **Main Wizard Modal** - Orchestration component
4. **Task Controls & Actions** - Management functionality
5. **Live Tracking Integration** - Real-time updates
6. **Launch Button Integration** - Entry points

## Success Criteria

- [ ] Can create multiple tasks with custom descriptions
- [ ] Can select and preview bundled context (docs + files)
- [ ] Token estimate accurately reflects context size
- [ ] Tasks launch successfully with bundled context
- [ ] Live tracking shows real-time pipeline progress
- [ ] Task detail modal shows complete task information
- [ ] Pause/cancel/retry controls work correctly
- [ ] Integration seamless with existing project detail page

## Testing Requirements

- Unit tests for context assembly logic
- Integration tests for wizard workflow
- E2E tests for complete launch-to-completion flow
- Performance testing with large document sets
- Mobile responsiveness testing

## Acceptance Criteria

✅ **Functional:**
- Pipeline Launch Wizard opens from project detail page
- Multi-task creation with individual descriptions
- Document and file selection with preview
- Context bundling with accurate token estimates
- Successful task dispatch using `/api/tasks/{id}/start`
- Live pipeline tracking with 5-second refresh
- Task detail expansion with full information display
- Working pause/cancel/retry controls

✅ **Technical:**
- All endpoints follow RESTful conventions
- Database schema properly extended
- Components are reusable and well-structured
- Integration with existing codebase seamless
- Performance optimized for large contexts

✅ **UX:**
- Wizard flow is intuitive and smooth
- Error states handled gracefully
- Loading states visible for all async operations
- Mobile-responsive design maintained
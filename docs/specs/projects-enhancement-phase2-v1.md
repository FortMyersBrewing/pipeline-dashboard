# Implementation Spec: Projects Enhancement Phase 2
**Task ID:** bbb38e47-4294-4a0d-b7ac-722928b7ae25  
**Version:** 1  
**Project:** pipeline-dashboard  
**Created:** 2026-03-05

## Overview
This phase adds document management with inline markdown editing and a kanban board for task management to the pipeline dashboard. Building on Phase 1's foundation, this enhancement provides comprehensive project documentation capabilities and visual task management.

## Current State Analysis

### Existing Code Structure
- **Project detail page:** `src/routes/projects/[slug]/+page.svelte` - basic project info, task list
- **Database:** `project_docs` table exists (Phase 1), missing `doc_versions` table
- **Types:** `ProjectDoc` interface exists in `src/lib/types.ts`
- **API patterns:** CRUD operations in `/api/projects/` with proper error handling
- **Tech stack:** SvelteKit 5, Svelte 5 runes, Tailwind CSS, better-sqlite3

### Dependencies to Install
```bash
npm install @codemirror/view @codemirror/state @codemirror/lang-markdown @codemirror/theme-one-dark
```

## Implementation Plan

### 1. Database Schema Updates

#### Add doc_versions Table
```sql
CREATE TABLE IF NOT EXISTS doc_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id INTEGER NOT NULL REFERENCES project_docs(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content TEXT NOT NULL,
    changed_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Location:** Add to `src/lib/db.ts` in `initDb()` function

### 2. Types Enhancements

#### New Interfaces
```typescript
export interface DocVersion {
    id: number;
    doc_id: number;
    version: number;
    content: string;
    changed_by: string | null;
    created_at: string;
}

export interface DocTemplate {
    type: ProjectDoc['doc_type'];
    template: string;
}
```

**Location:** Add to `src/lib/types.ts`

### 3. Document API Endpoints

#### GET /api/projects/[id]/docs
- List all documents for a project
- Include doc type, title, version, last updated
- Order by `created_at DESC`

#### POST /api/projects/[id]/docs  
- Create new document with template content based on doc_type
- Accept: `{title, doc_type, content?, file_path?, url?}`
- Default templates for each doc type

#### PUT /api/projects/[id]/docs/[docId]
- Update document content
- Save previous version to `doc_versions` table before update
- Increment version number

#### DELETE /api/projects/[id]/docs/[docId]
- Soft delete or hard delete (design choice)
- Cascade delete versions

**Location:** Create `src/routes/api/projects/[id]/docs/+server.ts` and `src/routes/api/projects/[id]/docs/[docId]/+server.ts`

### 4. CodeMirror Markdown Editor Component

#### Component: `src/lib/components/MarkdownEditor.svelte`
```typescript
// CRITICAL: Dynamic import in onMount to avoid SSR issues
let editorView: EditorView;

onMount(async () => {
    const { EditorView, keymap } = await import('@codemirror/view');
    const { EditorState } = await import('@codemirror/state');
    const { markdown } = await import('@codemirror/lang-markdown');
    const { oneDark } = await import('@codemirror/theme-one-dark');
    // Initialize editor
});
```

#### Features
- Split view: editor left, rendered preview right
- Auto-save: on blur or after 2s idle using `$effect(() => {})`  
- Dark theme matching dashboard aesthetics
- Toolbar: Bold, Italic, Headers (H1-H3), Code, Link, List
- Resize handle between editor and preview

### 5. Document Templates

#### Template Library
```typescript
const DOC_TEMPLATES = {
    spec: `# Specification

## Problem
What problem are we solving?

## Solution  
How will we solve it?

## Requirements
- Functional requirements
- Non-functional requirements

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2`,

    design: `# Design Document

## Overview
Brief description of the design

## User Flow
Step by step user journey

## Components
Key UI/UX components

## Mockup Notes
Links to designs, wireframes, prototypes`,

    architecture: `# Architecture Document

## System Overview
High-level architecture description

## Components
Major system components and their responsibilities

## Data Flow
How data moves through the system

## Dependencies
External dependencies and integrations`,

    reference: `# Reference Document

## Overview
What this document covers

## Links
- [Resource 1](url)
- [Resource 2](url)

## Notes
Additional context and information`,

    notes: `# Notes

## Meeting Notes
Date:
Attendees:

## Discussion Points
- Point 1
- Point 2

## Action Items
- [ ] Action 1
- [ ] Action 2`
};
```

### 6. Project Detail Page Enhancements

#### Documents Section
- Grid layout with document cards
- Each card shows: title, doc type icon, last updated, content preview (first 100 chars)
- Doc type icons: 📋 Spec, 🎨 Design, 🏗️ Architecture, 📎 Reference, 📝 Notes
- "+ New Document" button with type selector dropdown
- Click card to open modal/page with MarkdownEditor

#### Kanban Board Section
```svelte
<div class="kanban-board grid grid-cols-5 gap-4">
    {#each ['queued', 'in_progress', 'review', 'done', 'failed'] as status}
        <div class="kanban-column" 
             on:drop={handleDrop} 
             on:dragover={handleDragOver}>
            <h3>{status}</h3>
            {#each tasksGroupedByStatus[status] as task}
                <div class="task-card" 
                     draggable="true"
                     on:dragstart={(e) => handleDragStart(e, task)}>
                    <!-- Task content -->
                </div>
            {/each}
        </div>
    {/each}
</div>
```

#### HTML5 Drag and Drop Implementation
- `dragstart`: Store task ID in `dataTransfer`
- `dragover`: Prevent default and add visual feedback
- `drop`: Extract task ID, determine new status, PATCH `/api/tasks/[id]`
- Optimistic UI: Update local state immediately, handle errors

#### Quick-Add Task Bar
```svelte
<form on:submit={handleAddTask} class="flex gap-2 mb-4">
    <input bind:value={newTaskTitle} placeholder="Task title..." class="flex-1" />
    <button type="submit">Add Task</button>
</form>
```

### 7. Enhanced Environment Notes

#### Replace Plain Textarea
- Use MarkdownEditor component for `env_notes`
- Toggle between edit/preview modes
- Auto-save to `projects.env_notes` column

## Technical Implementation Notes

### SSR Compatibility
- **CRITICAL:** CodeMirror must be dynamically imported in `onMount()` 
- Never import CodeMirror at top level - it will break SSR
- Use `await import()` pattern consistently

### State Management  
- Use Svelte 5 runes: `$state`, `$derived`, `$effect`
- Optimistic UI for drag-and-drop operations
- Auto-save with debouncing using `$effect` with cleanup

### Styling
- Maintain dark theme consistency
- Use existing Tailwind classes: `bg-bg-card`, `border-border`, `text-text`
- Match existing component patterns from current pages

### Error Handling
- Follow existing API error patterns
- Toast notifications for user feedback  
- Graceful fallbacks for failed operations

## File Structure
```
src/
├── lib/
│   ├── components/
│   │   ├── MarkdownEditor.svelte (new)
│   │   ├── DocumentCard.svelte (new)
│   │   └── KanbanBoard.svelte (new)
│   ├── db.ts (update)
│   └── types.ts (update)
├── routes/
│   ├── api/
│   │   └── projects/
│   │       └── [id]/
│   │           ├── docs/
│   │           │   ├── +server.ts (new)
│   │           │   └── [docId]/
│   │           │       └── +server.ts (new)
│   │           └── +server.ts (update)
│   └── projects/
│       └── [slug]/
│           └── +page.svelte (update)
└── app.html
```

## Testing Strategy
- Verify CodeMirror loads without SSR errors
- Test drag-and-drop functionality across browsers
- Validate document CRUD operations
- Check auto-save functionality
- Test template insertion for new documents

## Success Criteria
1. ✅ Document management UI works without SSR errors
2. ✅ CodeMirror editor loads and functions properly
3. ✅ Drag-and-drop kanban updates task status via API
4. ✅ Document templates are properly inserted
5. ✅ Auto-save works reliably for both docs and env_notes
6. ✅ All existing functionality remains intact
7. ✅ Build and type checking passes
8. ✅ Dark theme consistency maintained

## Implementation Order
1. Install CodeMirror dependencies  
2. Update database schema (doc_versions table)
3. Update types.ts with new interfaces
4. Create document API endpoints  
5. Build MarkdownEditor component (with proper dynamic imports)
6. Create document management UI on project detail page
7. Implement kanban board with drag-and-drop
8. Add quick-add task functionality
9. Enhanced env_notes with markdown editing
10. Testing and refinement
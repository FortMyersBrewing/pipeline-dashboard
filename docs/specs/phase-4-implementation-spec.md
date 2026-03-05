# Phase 4 Implementation Spec: GitHub Deep + Dependencies + Polish

**Task ID:** b0ea99c9-8af9-4f7c-9c84-244fba9503df  
**Author:** coder agent  
**Date:** 2026-03-05  
**Status:** Scout Stage Complete  

## Current State Analysis

### Already Implemented (Phases 1-3)
✅ **Project CRUD**: Create, read, update, delete projects  
✅ **Project Detail Pages**: Full project pages with tabs  
✅ **Document Management**: Create, edit, version docs with markdown editor  
✅ **Task Kanban**: Drag-and-drop task management  
✅ **Pipeline Launch Wizard**: Multi-task context bundling  
✅ **GitHub Import**: Browse and import existing repos  
✅ **Search & Filtering**: Project list search and filtering  

### Database Schema (Already Migrated)
✅ `project_docs` table with version history  
✅ `project_deps` table for dependencies  
✅ Extended `projects` table with description, tags, env_notes  
✅ Extended `tasks` table with context bundling fields  

### Existing API Endpoints
✅ `/api/projects` - CRUD  
✅ `/api/projects/[id]/docs` - Document management  
✅ `/api/projects/[id]/launch` - Pipeline launch  
✅ `/api/github/repos` - List FMB org repos  
✅ `/api/github/import` - Import existing repos  

## Phase 4 Requirements to Implement

### 1. GitHub Repo Creation from Dashboard
**Status:** ❌ Not implemented  
**Files to create/modify:**
- `src/routes/api/github/create/+server.ts` - POST endpoint  
- `src/lib/components/projects/GitHubCreateModal.svelte` - UI component  
- Modify `src/routes/projects/+page.svelte` - Add "Create GitHub Repo" option  

**API Spec:**
```
POST /api/github/create
Body: { name, description, private: boolean, org: "FortMyersBrewing" }
Response: { repo_url, clone_path, success }
Implementation: gh repo create {org}/{name} --private/--public --description "{desc}" --clone ~/projects/{name}
```

### 2. GitHub Issue Import
**Status:** ❌ Not implemented  
**Files to create/modify:**
- `src/routes/api/projects/[id]/github-issues/+server.ts` - GET endpoint  
- `src/lib/components/projects/IssueImportModal.svelte` - UI component  
- Modify `src/routes/projects/[slug]/+page.svelte` - Add "Import Issues" button  

**API Spec:**
```
GET /api/projects/[id]/github-issues
Response: [ { number, title, body, labels, state, url } ]
Implementation: gh issue list --repo {repo_url} --json number,title,body,labels,state,url --limit 50
```

### 3. Git History Display
**Status:** ❌ Not implemented  
**Files to create/modify:**
- `src/routes/api/projects/[id]/commits/+server.ts` - GET endpoint  
- `src/routes/api/projects/[id]/prs/+server.ts` - GET endpoint  
- `src/lib/components/projects/GitHistoryTab.svelte` - UI component  
- Modify `src/routes/projects/[slug]/+page.svelte` - Add "Git History" tab  

**API Specs:**
```
GET /api/projects/[id]/commits
Response: [ { sha, message, author, date } ]
Implementation: cd {repo_path} && git log --oneline -20 --format='%h|%s|%an|%ai'

GET /api/projects/[id]/prs
Response: [ { number, title, state, author, createdAt, url } ]
Implementation: gh pr list --repo {repo_url} --json number,title,state,author,createdAt,url --limit 10
```

### 4. CI Status Display
**Status:** ❌ Not implemented  
**Files to create/modify:**
- `src/routes/api/projects/[id]/ci/+server.ts` - GET endpoint  
- `src/lib/components/projects/CIStatusBadge.svelte` - UI component  
- Modify `src/routes/projects/[slug]/+page.svelte` - Add CI badge to header  
- Modify `src/routes/projects/+page.svelte` - Add CI badges to project cards  

**API Spec:**
```
GET /api/projects/[id]/ci
Response: [ { status, conclusion, name, createdAt, url } ]
Implementation: gh run list --repo {repo_url} --json status,conclusion,name,createdAt,url --limit 5
```

### 5. Project Dependencies UI
**Status:** ❌ Not implemented (API exists, UI missing)  
**Files to create/modify:**
- `src/routes/api/projects/[id]/deps/+server.ts` - GET/POST/DELETE endpoints  
- `src/lib/components/projects/DependenciesSection.svelte` - UI component  
- Modify `src/routes/projects/[slug]/+page.svelte` - Add Dependencies section to overview tab  

**API Specs:**
```
GET /api/projects/[id]/deps
Response: { depends_on: [], depended_by: [] }

POST /api/projects/[id]/deps
Body: { depends_on: project_id, note: string }

DELETE /api/projects/[id]/deps/[depId]
```

### 6. Project Health Dashboard
**Status:** ❌ Not implemented  
**Files to create/modify:**
- `src/routes/api/projects/[id]/health/+server.ts` - GET endpoint  
- `src/lib/components/projects/HealthIndicator.svelte` - UI component  
- Modify `src/routes/projects/+page.svelte` - Add health indicators to project cards  
- Modify `src/routes/projects/[slug]/+page.svelte` - Add health section to overview  

**API Spec:**
```
GET /api/projects/[id]/health
Response: {
  last_commit_date, days_since_commit, freshness: "fresh|aging|stale",
  open_tasks, failed_tasks, ci_status, health_score: "healthy|warning|critical"
}
Implementation: git log, task queries, CI status aggregation
```

### 7. Clone/Fork as Template
**Status:** ❌ Not implemented  
**Files to create/modify:**
- `src/lib/components/projects/CloneAsTemplateModal.svelte` - UI component  
- Modify `src/routes/projects/[slug]/+page.svelte` - Add "Use as Template" button  
- Use existing `/api/projects` POST endpoint with template data  

### 8. UX Polish
**Status:** ❌ Not implemented  
**Files to create/modify:**
- `src/lib/components/ui/Toast.svelte` - Toast notification component  
- `src/lib/components/ui/ConfirmDialog.svelte` - Confirmation dialog component  
- `src/lib/stores/ui.ts` - UI state management  
- `src/lib/components/KeyboardShortcuts.svelte` - Global shortcuts handler  
- Modify multiple files to add responsive design, loading states, etc.  

**Features:**
- Keyboard shortcuts: N (new project), L (launch pipeline), Escape (close modals), / (search)  
- Toast notifications for actions (auto-dismiss 3s)  
- Confirmation dialogs for destructive actions  
- Loading skeletons and empty states  
- Responsive design for tablet width  

## Implementation Plan

### Stage 1: GitHub Deep Integration (1-3)
1. **GitHub Repo Creation API** - Implement `POST /api/github/create`
2. **GitHub Issues Import API** - Implement `GET /api/projects/[id]/github-issues`  
3. **Git History APIs** - Implement commits and PRs endpoints
4. **UI Components** - Create modals and tab components
5. **Integration** - Wire up components to project detail page

### Stage 2: Health & Dependencies (4-6)  
1. **CI Status API** - Implement `GET /api/projects/[id]/ci`
2. **Dependencies API** - Implement GET/POST/DELETE for deps
3. **Health Dashboard API** - Implement `GET /api/projects/[id]/health`
4. **UI Components** - Create health indicators and dependency sections
5. **Integration** - Add to project cards and detail pages

### Stage 3: Templates & Polish (7-8)
1. **Clone Template Feature** - Implement template cloning
2. **Toast System** - Global notification system
3. **Keyboard Shortcuts** - Global shortcut handler
4. **Confirmation Dialogs** - Destructive action confirmations
5. **Responsive Polish** - Loading states, empty states, tablet responsiveness

## Technical Notes

### gh CLI Usage
All GitHub operations use `/opt/homebrew/bin/gh` CLI (already authenticated)  
Error handling for auth issues and network failures required  

### Database
All tables already exist from previous phases  
No additional migrations needed  

### UI Patterns
Follow existing Tailwind dark theme patterns  
Use existing components like `MarkdownEditor`, `DocumentCard`  
Maintain consistency with current design system  

### Error Handling
Graceful fallbacks when GitHub features aren't available  
Clear error messages for auth/network issues  
Non-blocking failures (show empty state instead of breaking page)  

## Success Criteria

### Functional Requirements
✅ Can create new GitHub repos from dashboard  
✅ Can import GitHub issues as pipeline tasks  
✅ Can view recent commits and PRs on project page  
✅ Can see CI status badges on projects  
✅ Can manage project dependencies with cycle prevention  
✅ Can see health indicators (fresh/aging/stale)  
✅ Can clone existing projects as templates  
✅ All keyboard shortcuts work correctly  
✅ Toast notifications appear for all actions  

### Technical Requirements
✅ All APIs return proper error responses  
✅ UI components are reusable and properly typed  
✅ No breaking changes to existing functionality  
✅ Responsive design works on tablet widths  
✅ Loading states prevent UI blocking  
✅ Error states show helpful messages  

### Quality Gates (Gatekeeper Stage)
✅ `npx svelte-check --threshold error` passes  
✅ `npm run build` succeeds  
✅ No TypeScript errors  
✅ All new APIs have proper error handling  

## File Structure Summary

```
src/routes/api/
├── github/
│   ├── create/+server.ts          # NEW - repo creation
│   ├── repos/+server.ts           # EXISTS - repo listing  
│   └── import/+server.ts          # EXISTS - repo import
├── projects/[id]/
│   ├── github-issues/+server.ts   # NEW - issue import
│   ├── commits/+server.ts         # NEW - commit history
│   ├── prs/+server.ts             # NEW - PR history  
│   ├── ci/+server.ts              # NEW - CI status
│   ├── health/+server.ts          # NEW - health metrics
│   └── deps/+server.ts            # NEW - dependencies

src/lib/components/
├── ui/
│   ├── Toast.svelte               # NEW - notifications
│   ├── ConfirmDialog.svelte       # NEW - confirmations
│   └── KeyboardShortcuts.svelte   # NEW - shortcuts
├── projects/
│   ├── GitHubCreateModal.svelte   # NEW - repo creation
│   ├── IssueImportModal.svelte    # NEW - issue import
│   ├── GitHistoryTab.svelte       # NEW - git history
│   ├── CIStatusBadge.svelte       # NEW - CI status
│   ├── HealthIndicator.svelte     # NEW - health badge
│   ├── DependenciesSection.svelte # NEW - deps management
│   └── CloneAsTemplateModal.svelte # NEW - template cloning

src/lib/stores/
└── ui.ts                          # NEW - UI state management
```

This spec provides a comprehensive roadmap for implementing all Phase 4 features while maintaining compatibility with the existing codebase. Each component builds on established patterns and the implementation can proceed incrementally through the defined stages.
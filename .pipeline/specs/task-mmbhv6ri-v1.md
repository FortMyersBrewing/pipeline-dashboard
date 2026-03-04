# Task Implementation Spec: Docs Page - Project File Browser

**Task ID:** task-mmbhv6ri  
**Version:** 1  
**Created:** 2026-03-03 22:49 EST  
**Agent:** Scout (coder)

## Overview

Transform the existing docs page (`src/routes/docs/+page.svelte`) from a hardcoded markdown viewer to a dynamic project file browser. Users can select a project from a dropdown, browse its file tree, and view file contents (excluding binary files). No editing capabilities.

## Files to Modify

### 1. `src/routes/docs/+page.svelte`
**Type:** Major modification
**Purpose:** Convert from static docs viewer to dynamic project file browser

**Current State:**
- Hardcoded list of known docs (`ARCHITECTURE.md`, `SPEC.md`, etc.)
- Basic markdown rendering
- File list from `/api/files?base=docs`
- Simple sidebar/content layout

**New Structure:**
```typescript
<script lang="ts">
	import { onMount } from 'svelte';

	// State management
	let projects: Project[] = $state([]);
	let selectedProject: Project | null = $state(null);
	let currentPath = $state('');
	let fileTree: FileTreeNode[] = $state([]);
	let fileContent = $state('');
	let selectedFile = $state('');
	let loading = $state(false);
	let error = $state('');

	// Types
	interface Project {
		id: string;
		name: string;
		repo_path: string;
		stack_type: string;
	}

	interface FileTreeNode {
		name: string;
		path: string;
		type: 'file' | 'directory';
		size?: number;
		modified?: string;
		children?: FileTreeNode[];
		expanded?: boolean;
	}

	// Functions
	async function loadProjects(): Promise<void>
	async function selectProject(project: Project): Promise<void>
	async function loadFileTree(path = ''): Promise<void>
	async function toggleDirectory(node: FileTreeNode): Promise<void>
	async function selectFile(node: FileTreeNode): Promise<void>
	function isBinaryFile(filename: string): boolean
	function renderMarkdown(content: string): string
</script>
```

**Component Structure:**
```html
<div class="p-6 h-full flex flex-col">
	<!-- Header with project selector -->
	<div class="mb-4">
		<h1>Docs</h1>
		<select bind:value={selectedProject}><!-- Project dropdown --></select>
	</div>

	<div class="flex gap-4 flex-1 min-h-0">
		<!-- File tree sidebar -->
		<div class="w-64 shrink-0">
			{#each fileTree as node}
				{@render treeNode(node)}
			{/each}
		</div>

		<!-- File content area -->
		<div class="flex-1">
			{#if selectedFile}
				<!-- File content display -->
			{:else}
				<!-- Empty state -->
			{/if}
		</div>
	</div>
</div>
```

### 2. `src/routes/api/files/+server.ts`
**Type:** Minor modification
**Purpose:** Add support for project-based file browsing

**Current Functionality:**
- Only supports predefined bases (memory)
- Fixed directory structure

**New Functionality:**
Add project path resolution:
```typescript
// Add project base support
if (base === 'project' && projectId) {
	const project = getProjectById(projectId);
	if (project) {
		BASE_DIR = resolve(homedir(), project.repo_path.replace('~/', ''));
	}
}
```

**Parameters:**
- `base`: Add support for `'project'`
- `projectId`: New parameter for project-specific browsing
- `dir`: Existing directory parameter

## Files to Create

### 1. `src/routes/api/project-files/+server.ts`
**Type:** New API endpoint
**Purpose:** Project-specific file browsing with repo_path resolution

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readdirSync, statSync, existsSync } from 'fs';
import { resolve, join, relative } from 'path';
import { homedir } from 'os';
import { getDb } from '$lib/db';

export const GET: RequestHandler = ({ url }) => {
	const projectId = url.searchParams.get('project');
	const dir = url.searchParams.get('dir') || '';
	
	if (!projectId) {
		return json({ error: 'project parameter required' }, { status: 400 });
	}

	const db = getDb();
	const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
	
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	// Resolve project path (handle ~/... notation)
	let basePath = project.repo_path;
	if (basePath.startsWith('~/')) {
		basePath = resolve(homedir(), basePath.slice(2));
	}

	// Construct target directory
	const targetDir = resolve(basePath, dir);
	
	// Security check
	if (!targetDir.startsWith(basePath)) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	if (!existsSync(targetDir)) {
		return json({ error: 'Directory not found' }, { status: 404 });
	}

	try {
		const entries = readdirSync(targetDir)
			.filter(name => !name.startsWith('.') && !IGNORED_DIRS.has(name))
			.sort();
			
		const items = entries.map(name => {
			const fullPath = join(targetDir, name);
			const stat = statSync(fullPath);
			return {
				name,
				path: relative(basePath, fullPath),
				type: stat.isDirectory() ? 'directory' : 'file',
				size: stat.size,
				modified: stat.mtime.toISOString(),
			};
		});

		// Sort: directories first, then files
		items.sort((a, b) => {
			if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

		return json({ 
			project: project.name,
			path: dir,
			items 
		});
	} catch (error) {
		return json({ error: 'Failed to read directory' }, { status: 500 });
	}
};

const IGNORED_DIRS = new Set([
	'node_modules', '.git', '.svelte-kit', 'build', 'dist', 
	'.next', '.nuxt', '__pycache__', '.pytest_cache', 
	'.vscode', '.idea', 'coverage'
]);
```

### 2. `src/routes/api/project-files/[projectId]/[...path]/+server.ts`
**Type:** New API endpoint  
**Purpose:** Retrieve file content from project paths

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { getDb } from '$lib/db';

export const GET: RequestHandler = ({ params }) => {
	const { projectId, path } = params;
	
	const db = getDb();
	const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
	
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	// Resolve project path
	let basePath = project.repo_path;
	if (basePath.startsWith('~/')) {
		basePath = resolve(homedir(), basePath.slice(2));
	}

	const filePath = resolve(basePath, path);
	
	// Security check
	if (!filePath.startsWith(basePath)) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	if (!existsSync(filePath)) {
		return json({ error: 'File not found' }, { status: 404 });
	}

	try {
		const stat = statSync(filePath);
		if (stat.isDirectory()) {
			return json({ error: 'Path is a directory' }, { status: 400 });
		}

		// Check if file is binary
		if (isBinaryFile(path)) {
			return json({ 
				error: 'Binary file detected', 
				isBinary: true,
				size: stat.size,
				type: 'binary'
			}, { status: 415 });
		}

		const content = readFileSync(filePath, 'utf-8');
		return json({ 
			content, 
			path,
			size: stat.size,
			modified: stat.mtime.toISOString(),
			type: getFileType(path)
		});
	} catch (error) {
		return json({ error: 'Failed to read file' }, { status: 500 });
	}
};

function isBinaryFile(filename: string): boolean {
	const binaryExtensions = new Set([
		'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
		'.pdf', '.zip', '.tar', '.gz', '.bz2', '.rar',
		'.exe', '.bin', '.dll', '.so', '.dylib',
		'.mp3', '.mp4', '.avi', '.mov', '.wav',
		'.db', '.sqlite', '.sqlite3'
	]);
	
	const ext = filename.toLowerCase().split('.').pop();
	return ext ? binaryExtensions.has(`.${ext}`) : false;
}

function getFileType(filename: string): string {
	const ext = filename.toLowerCase().split('.').pop();
	const typeMap: Record<string, string> = {
		'md': 'markdown',
		'js': 'javascript',
		'ts': 'typescript',
		'svelte': 'svelte',
		'json': 'json',
		'py': 'python',
		'css': 'css',
		'html': 'html',
		'txt': 'text'
	};
	return typeMap[ext || ''] || 'text';
}
```

## Implementation Details

### Project Dropdown Component
```typescript
<select 
	bind:value={selectedProject} 
	onchange={() => selectedProject && selectProject(selectedProject)}
	class="w-64 px-3 py-2 bg-bg-card border border-border rounded-md text-sm"
>
	<option value={null}>Select a project...</option>
	{#each projects as project}
		<option value={project}>{project.name}</option>
	{/each}
</select>
```

### File Tree Recursive Component
```typescript
{#snippet treeNode(node: FileTreeNode, depth = 0)}
	<div class="flex items-center py-1 px-2 hover:bg-bg-hover rounded-md transition-colors"
		 style="margin-left: {depth * 16}px">
		
		{#if node.type === 'directory'}
			<button onclick={() => toggleDirectory(node)}
					class="flex items-center gap-1 text-xs text-text-muted w-full text-left">
				<span class="text-xs">{node.expanded ? '📂' : '📁'}</span>
				{node.name}
			</button>
		{:else}
			<button onclick={() => selectFile(node)}
					class="flex items-center gap-1 text-xs text-text-muted w-full text-left
						   {selectedFile === node.path ? 'text-accent font-medium' : 'hover:text-text'}">
				<span class="text-xs">{getFileIcon(node.name)}</span>
				{node.name}
			</button>
		{/if}
	</div>
	
	{#if node.type === 'directory' && node.expanded && node.children}
		{#each node.children as child}
			{@render treeNode(child, depth + 1)}
		{/each}
	{/if}
{/snippet}
```

### File Content Display
```typescript
// In the content area
{#if loading}
	<div class="flex items-center justify-center h-full">
		<div class="text-xs text-text-muted">Loading file...</div>
	</div>
{:else if error}
	<div class="p-6 text-xs text-error">{error}</div>
{:else if selectedFile}
	<div class="h-full flex flex-col">
		<div class="px-4 py-2.5 border-b border-border bg-bg-card">
			<span class="text-xs font-mono text-text-muted">{selectedFile}</span>
		</div>
		<div class="flex-1 overflow-y-auto p-6">
			{#if fileType === 'markdown'}
				{@html renderMarkdown(fileContent)}
			{:else}
				<pre class="text-xs font-mono text-text-muted whitespace-pre-wrap">{fileContent}</pre>
			{/if}
		</div>
	</div>
{:else}
	<div class="flex items-center justify-center h-full text-xs text-text-dim">
		{selectedProject ? 'Select a file to view its contents' : 'Select a project to browse files'}
	</div>
{/if}
```

## Function Signatures

### Core Functions
```typescript
// Load all projects from database
async function loadProjects(): Promise<void>

// Switch to a different project
async function selectProject(project: Project): Promise<void>

// Load file tree for current path
async function loadFileTree(path: string = ''): Promise<FileTreeNode[]>

// Toggle directory expansion and lazy-load children
async function toggleDirectory(node: FileTreeNode): Promise<void>

// Load and display file content
async function selectFile(node: FileTreeNode): Promise<void>

// Check if file extension indicates binary content
function isBinaryFile(filename: string): boolean

// Get appropriate icon for file type
function getFileIcon(filename: string): string

// Enhanced markdown renderer (existing)
function renderMarkdown(content: string): string
```

### API Functions
```typescript
// Fetch projects from database
fetch('/api/projects') => Project[]

// Fetch directory contents for project
fetch(`/api/project-files?project=${projectId}&dir=${path}`) => {
	project: string;
	path: string;
	items: FileItem[];
}

// Fetch file content from project
fetch(`/api/project-files/${projectId}/${path}`) => {
	content: string;
	path: string;
	size: number;
	modified: string;
	type: string;
} | {
	error: string;
	isBinary: boolean;
	size: number;
	type: 'binary';
}
```

## Acceptance Criteria

- [ ] Project dropdown populated from `projects` table
- [ ] Dropdown shows project name, sorted alphabetically
- [ ] Selecting project loads file tree from `repo_path`
- [ ] File tree shows directories and files with appropriate icons
- [ ] Directories are collapsible/expandable
- [ ] Clicking a directory toggles its expansion state
- [ ] Directory expansion lazy-loads child items
- [ ] Clicking a file loads and displays its content
- [ ] Binary files show "Binary file detected" message instead of content
- [ ] Text files display with monospace font
- [ ] Markdown files render with existing markdown renderer
- [ ] Selected file path shown in content header
- [ ] File tree shows current selection with accent styling
- [ ] Empty directories show "(empty)" message
- [ ] Error states handled gracefully (missing paths, access denied)
- [ ] Loading states shown during file/directory operations
- [ ] URL does not change (client-side only navigation)
- [ ] Responsive layout matches existing dashboard design
- [ ] All existing styling/design patterns maintained

## Edge Cases to Handle

### File System Edge Cases
- [ ] **Missing project paths**: Show "Project path not found" error
- [ ] **Access denied**: Show "Access denied" for paths outside repo_path
- [ ] **Empty directories**: Display "(empty)" message in tree
- [ ] **Large files**: Consider size limit (>1MB) with truncation warning
- [ ] **Deep directory nesting**: Implement reasonable depth limit (10 levels)
- [ ] **Symbolic links**: Either follow them or ignore them consistently
- [ ] **Special characters in filenames**: Ensure proper encoding/escaping

### Binary File Detection
- [ ] **Common binary extensions**: `.png`, `.jpg`, `.pdf`, `.zip`, `.exe`, `.db`, etc.
- [ ] **Files without extensions**: Check for binary content heuristically
- [ ] **Mixed content files**: Handle gracefully if text file has binary portions

### UI/UX Edge Cases
- [ ] **No projects**: Show "No projects available" message
- [ ] **Project with no files**: Show "Project directory is empty"
- [ ] **Network errors**: Retry capability or clear error messages
- [ ] **Long file paths**: Truncate or wrap appropriately in UI
- [ ] **Large file trees**: Consider virtual scrolling for 1000+ files

### Performance Considerations
- [ ] **Lazy loading**: Only load directory contents when expanded
- [ ] **Debounced requests**: Prevent rapid-fire API calls during navigation
- [ ] **Cache file tree**: Avoid re-fetching unchanged directory contents
- [ ] **Large file content**: Stream or chunk large files instead of loading entirely

## What NOT to Change

### Preserve Existing Functionality
- **Do not modify** the existing markdown renderer function
- **Do not modify** the overall page layout structure (header, sidebar, main)
- **Do not change** existing CSS classes or Tailwind configuration
- **Do not alter** the navigation structure or sidebar position
- **Do not modify** any other API endpoints or routes
- **Do not change** the database schema or `projects` table structure

### Preserve UI/UX Patterns
- **Do not change** the existing color scheme or accent colors
- **Do not modify** typography scales or font families
- **Do not alter** spacing patterns or component sizes
- **Do not change** existing icon usage patterns (keep same icon style)
- **Do not modify** the responsive breakpoints or layout behavior

### Preserve File Structure
- **Do not move** or rename existing files outside of modifications listed above
- **Do not modify** `src/lib/db.ts` beyond reading project data
- **Do not change** any other existing API routes
- **Do not modify** the app configuration or Svelte/Vite setup

## Security Considerations

### Path Traversal Prevention
```typescript
// Always validate resolved paths stay within project bounds
const resolvedPath = resolve(basePath, userPath);
if (!resolvedPath.startsWith(basePath)) {
	throw new Error('Access denied');
}
```

### File Access Restrictions
- Only allow access to files within project `repo_path`
- Ignore dotfiles (`.env`, `.git`, etc.) in directory listings
- Exclude sensitive directories (`node_modules`, `.git`, etc.)
- Implement file size limits for content display

### Input Sanitization
- Escape user input in file paths
- Validate project IDs against database records
- Sanitize file content for HTML display (use `{@html}` cautiously)

## Testing Notes

### Manual Testing Checklist
1. Test with each project type (node, python, shell)
2. Test empty projects and projects with deep nesting
3. Test projects with binary files mixed with text files
4. Test projects with special characters in filenames
5. Test error scenarios (missing paths, permission issues)
6. Test responsive behavior and mobile layout
7. Verify no changes to existing docs functionality affect other pages

### Browser Compatibility
- Ensure modern JavaScript features work in target browsers
- Test file tree interaction on touch devices
- Verify file selection works on mobile/tablet layouts

---

**Spec completed by Scout agent at:** 2026-03-03 22:49 EST  
**Ready for Builder stage**
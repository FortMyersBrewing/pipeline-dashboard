<script lang="ts">
	import { onMount } from 'svelte';

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

	// State management
	let projects: Project[] = $state([]);
	let selectedProject: Project | null = $state(null);
	let currentPath = $state('');
	let fileTree: FileTreeNode[] = $state([]);
	let fileContent = $state('');
	let selectedFile = $state('');
	let fileType = $state('text');
	let loading = $state(false);
	let error = $state('');

	// Simple markdown to HTML converter (preserved from original)
	function renderMarkdown(md: string): string {
		let html = md
			// Code blocks
			.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-bg rounded-lg p-4 my-3 overflow-x-auto border border-border"><code class="text-xs font-mono text-text-muted">$2</code></pre>')
			// Inline code
			.replace(/`([^`]+)`/g, '<code class="bg-bg px-1.5 py-0.5 rounded text-xs font-mono text-accent">$1</code>')
			// Headers
			.replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-text mt-6 mb-2">$1</h3>')
			.replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold text-text mt-8 mb-3 pb-2 border-b border-border">$1</h2>')
			.replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold text-text mt-6 mb-4">$1</h1>')
			// Bold and italic
			.replace(/\*\*(.+?)\*\*/g, '<strong class="text-text font-semibold">$1</strong>')
			.replace(/\*(.+?)\*/g, '<em>$1</em>')
			// Links
			.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-accent hover:underline">$1</a>')
			// Lists
			.replace(/^- (.+)$/gm, '<li class="ml-4 text-xs text-text-muted leading-6 list-disc">$1</li>')
			.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 text-xs text-text-muted leading-6 list-decimal">$1</li>')
			// Blockquotes
			.replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-accent pl-4 my-2 text-text-muted italic">$1</blockquote>')
			// Horizontal rule
			.replace(/^---$/gm, '<hr class="border-border my-6" />')
			// Paragraphs
			.replace(/\n\n/g, '</p><p class="text-xs text-text-muted leading-6 mb-3">')
			// Line breaks
			.replace(/\n/g, '<br />');

		return `<div class="prose-dark"><p class="text-xs text-text-muted leading-6 mb-3">${html}</p></div>`;
	}

	// Load all projects from database
	async function loadProjects(): Promise<void> {
		try {
			const res = await fetch('/api/projects');
			const data = await res.json();
			if (res.ok) {
				projects = data.sort((a: Project, b: Project) => a.name.localeCompare(b.name));
			}
		} catch (e) {
			console.error('Failed to load projects:', e);
		}
	}

	// Switch to a different project
	async function selectProject(project: Project): Promise<void> {
		selectedProject = project;
		currentPath = '';
		selectedFile = '';
		fileContent = '';
		fileType = 'text';
		error = '';
		await loadFileTree();
	}

	// Load file tree for current path
	async function loadFileTree(path: string = ''): Promise<void> {
		if (!selectedProject) return;
		
		loading = true;
		error = '';
		
		try {
			const res = await fetch(`/api/project-files?project=${selectedProject.id}&dir=${encodeURIComponent(path)}`);
			const data = await res.json();
			
			if (!res.ok) {
				error = data.error || 'Failed to load directory';
				fileTree = [];
				return;
			}

			// Convert flat items to tree structure
			const items = data.items.map((item: any) => ({
				name: item.name,
				path: item.path,
				type: item.type,
				size: item.size,
				modified: item.modified,
				expanded: false,
				children: item.type === 'directory' ? [] : undefined
			}));

			if (path === '') {
				fileTree = items;
			} else {
				// Update children for expanded directory
				updateTreeChildren(fileTree, path, items);
			}
		} catch (e) {
			error = 'Failed to load file tree';
			fileTree = [];
		} finally {
			loading = false;
		}
	}

	// Helper to update children in nested tree structure
	function updateTreeChildren(nodes: FileTreeNode[], targetPath: string, newChildren: FileTreeNode[]) {
		for (const node of nodes) {
			if (node.path === targetPath && node.type === 'directory') {
				node.children = newChildren;
				return true;
			}
			if (node.children && updateTreeChildren(node.children, targetPath, newChildren)) {
				return true;
			}
		}
		return false;
	}

	// Toggle directory expansion and lazy-load children
	async function toggleDirectory(node: FileTreeNode): Promise<void> {
		if (node.type !== 'directory') return;
		
		node.expanded = !node.expanded;
		
		if (node.expanded && (!node.children || node.children.length === 0)) {
			await loadFileTree(node.path);
		}
	}

	// Load and display file content
	async function selectFile(node: FileTreeNode): Promise<void> {
		if (node.type !== 'file' || !selectedProject) return;
		
		loading = true;
		error = '';
		selectedFile = node.path;
		
		try {
			const res = await fetch(`/api/project-files/${selectedProject.id}/${encodeURIComponent(node.path)}`);
			const data = await res.json();
			
			if (!res.ok) {
				if (data.isBinary) {
					error = `Binary file detected (${formatFileSize(data.size)})`;
					fileContent = '';
				} else {
					error = data.error || 'Failed to load file';
					fileContent = '';
				}
				return;
			}
			
			fileContent = data.content;
			fileType = data.type;
			error = '';
		} catch (e) {
			error = 'Failed to load file content';
			fileContent = '';
		} finally {
			loading = false;
		}
	}

	// Check if file extension indicates binary content
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

	// Get appropriate icon for file type
	function getFileIcon(filename: string): string {
		if (filename.endsWith('.md')) return '📝';
		if (filename.endsWith('.js') || filename.endsWith('.ts')) return '📄';
		if (filename.endsWith('.svelte')) return '🔧';
		if (filename.endsWith('.json')) return '📋';
		if (filename.endsWith('.py')) return '🐍';
		if (filename.endsWith('.css')) return '🎨';
		if (filename.endsWith('.html')) return '🌐';
		if (filename.endsWith('.png') || filename.endsWith('.jpg') || filename.endsWith('.gif')) return '🖼️';
		return '📄';
	}

	// Format file size
	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	onMount(() => loadProjects());
</script>

<div class="p-6 h-full flex flex-col">
	<!-- Header with project selector -->
	<div class="mb-4">
		<h1 class="text-lg font-semibold text-text">Docs</h1>
		<p class="text-xs text-text-muted mt-0.5">Project documentation browser</p>
		
		<div class="mt-3">
			<select 
				bind:value={selectedProject} 
				onchange={() => selectedProject && selectProject(selectedProject)}
				class="w-64 px-3 py-2 bg-bg-card border border-border rounded-md text-sm text-text"
			>
				<option value={null}>Select a project...</option>
				{#each projects as project}
					<option value={project}>{project.name}</option>
				{/each}
			</select>
		</div>
	</div>

	<div class="flex gap-4 flex-1 min-h-0">
		<!-- File tree sidebar -->
		<div class="w-64 shrink-0 bg-bg-card border border-border rounded-lg overflow-y-auto">
			<div class="px-4 py-2.5 border-b border-border">
				<p class="text-[10px] font-semibold text-text-dim uppercase tracking-wider">Files</p>
			</div>
			
			{#if selectedProject}
				{#if fileTree.length === 0 && !loading}
					<div class="p-4 text-xs text-text-muted">{error || '(empty)'}</div>
				{:else}
					{#each fileTree as node}
						{@render treeNode(node, 0)}
					{/each}
				{/if}
			{:else}
				<div class="p-4 text-xs text-text-muted">Select a project to browse files</div>
			{/if}
		</div>

		<!-- File content area -->
		<div class="flex-1 bg-bg-card border border-border rounded-lg overflow-y-auto">
			{#if loading}
				<div class="flex items-center justify-center h-full">
					<div class="text-xs text-text-muted">Loading...</div>
				</div>
			{:else if error}
				<div class="p-6 text-xs text-error">{error}</div>
			{:else if selectedFile && fileContent}
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
		</div>
	</div>
</div>

{#snippet treeNode(node: FileTreeNode, depth: number)}
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
					class="flex items-center gap-1 text-xs w-full text-left transition-colors
						   {selectedFile === node.path ? 'text-accent font-medium' : 'text-text-muted hover:text-text'}">
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
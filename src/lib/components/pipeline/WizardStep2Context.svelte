<script lang="ts">
	import { onMount } from 'svelte';
	import type { ProjectDoc } from '$lib/types';

	interface Props {
		projectId: string;
		projectDocs: ProjectDoc[];
		selectedDocs: number[];
		selectedFiles: string[];
		contextPreview: string;
		tokenEstimate: number;
	}

	let { 
		projectId, 
		projectDocs, 
		selectedDocs = $bindable(),
		selectedFiles = $bindable(),
		contextPreview,
		tokenEstimate
	}: Props = $props();

	interface FileItem {
		name: string;
		path: string;
		type: 'directory' | 'file';
		size: number;
	}

	let projectFiles = $state<FileItem[]>([]);
	let currentPath = $state('');
	let loadingFiles = $state(false);
	let showPreview = $state(false);

	const docTypeIcons = {
		spec: '📋',
		design: '🎨', 
		architecture: '🏗️',
		reference: '📎',
		notes: '📝'
	};

	onMount(() => {
		loadFiles('');
	});

	async function loadFiles(path: string) {
		loadingFiles = true;
		try {
			const response = await fetch(`/api/project-files?project=${projectId}&dir=${encodeURIComponent(path)}`);
			if (response.ok) {
				const data = await response.json();
				projectFiles = data.items || [];
				currentPath = path;
			}
		} catch (err) {
			console.error('Failed to load files:', err);
		} finally {
			loadingFiles = false;
		}
	}

	function navigateToPath(path: string) {
		if (path !== currentPath) {
			loadFiles(path);
		}
	}

	function toggleDocSelection(docId: number) {
		if (selectedDocs.includes(docId)) {
			selectedDocs = selectedDocs.filter(id => id !== docId);
		} else {
			selectedDocs = [...selectedDocs, docId];
		}
	}

	function toggleFileSelection(filePath: string) {
		const fullPath = currentPath ? `${currentPath}/${filePath}` : filePath;
		if (selectedFiles.includes(fullPath)) {
			selectedFiles = selectedFiles.filter(path => path !== fullPath);
		} else {
			selectedFiles = [...selectedFiles, fullPath];
		}
	}

	function formatFileSize(bytes: number): string {
		const units = ['B', 'KB', 'MB'];
		let size = bytes;
		let unitIndex = 0;
		
		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}
		
		return `${Math.round(size * 10) / 10} ${units[unitIndex]}`;
	}

	function formatTokenEstimate(tokens: number): string {
		if (tokens < 1000) return `${tokens} tokens`;
		if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K tokens`;
		return `${(tokens / 1000000).toFixed(1)}M tokens`;
	}
</script>

<div class="space-y-6">
	<div>
		<h3 class="text-base font-semibold text-text mb-2">Bundle Context</h3>
		<p class="text-sm text-text-muted mb-4">
			Select documentation and files to include as context for the coordinator agent.
			This helps the agent understand your project better.
		</p>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
		<!-- Documents Selection -->
		<div>
			<h4 class="text-sm font-medium text-text mb-3">Project Documents ({projectDocs.length})</h4>
			
			{#if projectDocs.length > 0}
				<div class="space-y-2 max-h-64 overflow-y-auto">
					{#each projectDocs as doc}
						<label class="flex items-center gap-3 p-3 border border-border rounded-lg 
							hover:border-border-light cursor-pointer transition-colors">
							<input 
								type="checkbox" 
								checked={selectedDocs.includes(doc.id)}
								onchange={() => toggleDocSelection(doc.id)}
								class="w-4 h-4 text-accent bg-bg-card border-border rounded focus:ring-accent"
							/>
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<span class="text-sm">{docTypeIcons[doc.doc_type]}</span>
									<span class="text-sm font-medium text-text truncate">{doc.title}</span>
								</div>
								<div class="text-xs text-text-muted">
									{doc.doc_type} • v{doc.version}
								</div>
							</div>
						</label>
					{/each}
				</div>
			{:else}
				<div class="text-center py-8 text-xs text-text-dim border border-border rounded-lg">
					No documents yet. Create docs in the Documents tab first.
				</div>
			{/if}
		</div>

		<!-- Files Selection -->
		<div>
			<h4 class="text-sm font-medium text-text mb-3">
				Project Files 
				{#if currentPath}
					<span class="text-text-muted">/{currentPath}</span>
				{/if}
			</h4>

			<div class="border border-border rounded-lg max-h-64 overflow-hidden">
				<!-- Path Navigation -->
				{#if currentPath}
					<div class="p-2 border-b border-border bg-bg-hover">
						<button 
							onclick={() => navigateToPath('')}
							class="text-xs text-accent hover:text-accent-hover"
						>
							← Back to root
						</button>
					</div>
				{/if}

				<!-- File List -->
				<div class="overflow-y-auto max-h-52">
					{#if loadingFiles}
						<div class="p-4 text-center text-text-muted text-xs">Loading...</div>
					{:else if projectFiles.length > 0}
						{#each projectFiles as file}
							<div class="flex items-center gap-2 p-2 hover:bg-bg-hover transition-colors">
								{#if file.type === 'directory'}
									<button 
										onclick={() => navigateToPath(file.path)}
										class="flex items-center gap-2 flex-1 text-left text-xs text-accent hover:text-accent-hover"
									>
										📁 {file.name}/
									</button>
								{:else}
									<label class="flex items-center gap-2 flex-1 cursor-pointer">
										<input 
											type="checkbox" 
											checked={selectedFiles.includes(file.path)}
											onchange={() => toggleFileSelection(file.name)}
											class="w-3 h-3 text-accent bg-bg-card border-border rounded focus:ring-accent"
										/>
										<span class="text-xs text-text truncate flex-1">{file.name}</span>
										<span class="text-xs text-text-dim">{formatFileSize(file.size)}</span>
									</label>
								{/if}
							</div>
						{/each}
					{:else}
						<div class="p-4 text-center text-text-muted text-xs">No files found</div>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Context Summary -->
	<div class="bg-bg-hover/50 border border-border rounded-lg p-4">
		<div class="flex items-center justify-between mb-3">
			<h4 class="text-sm font-medium text-text">Context Summary</h4>
			<button 
				onclick={() => showPreview = !showPreview}
				class="text-xs text-accent hover:text-accent-hover"
			>
				{showPreview ? 'Hide' : 'Show'} Preview
			</button>
		</div>
		
		<div class="grid grid-cols-3 gap-4 text-sm">
			<div>
				<div class="text-text-muted">Documents</div>
				<div class="font-medium text-text">{selectedDocs.length}</div>
			</div>
			<div>
				<div class="text-text-muted">Files</div>
				<div class="font-medium text-text">{selectedFiles.length}</div>
			</div>
			<div>
				<div class="text-text-muted">Est. Tokens</div>
				<div class="font-medium text-text">{formatTokenEstimate(tokenEstimate)}</div>
			</div>
		</div>
	</div>

	<!-- Context Preview -->
	{#if showPreview && contextPreview}
		<div class="border border-border rounded-lg">
			<div class="p-3 border-b border-border bg-bg-hover">
				<span class="text-xs font-medium text-text">Context Preview</span>
			</div>
			<div class="p-4 max-h-48 overflow-y-auto">
				<pre class="text-xs text-text-muted whitespace-pre-wrap font-mono">{contextPreview.slice(0, 1000)}{contextPreview.length > 1000 ? '\n...(truncated)' : ''}</pre>
			</div>
		</div>
	{/if}
</div>
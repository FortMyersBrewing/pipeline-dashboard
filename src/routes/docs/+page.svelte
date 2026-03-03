<script lang="ts">
	import { onMount } from 'svelte';

	let docFiles: { name: string; path: string }[] = $state([]);
	let currentDoc = $state('');
	let content = $state('');
	let renderedHtml = $state('');
	let loading = $state(false);
	let error = $state('');

	// Simple markdown to HTML converter
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

	async function loadDocList() {
		try {
			const res = await fetch('/api/files?dir=');
			const data = await res.json();
			if (data.items) {
				docFiles = data.items
					.filter((f: { name: string; type: string }) => f.name.endsWith('.md') || f.type === 'directory')
					.filter((f: { name: string }) => !f.name.startsWith('node_modules'));
			}
		} catch { /* ignore */ }
	}

	async function loadDoc(path: string) {
		loading = true;
		error = '';
		currentDoc = path;
		try {
			const res = await fetch(`/api/docs?path=${encodeURIComponent(path)}`);
			const data = await res.json();
			if (!res.ok) { error = data.error; content = ''; renderedHtml = ''; return; }
			content = data.content;
			renderedHtml = renderMarkdown(content);
		} catch { error = 'Failed to load document'; }
		finally { loading = false; }
	}

	// Known docs
	const knownDocs = [
		{ name: 'ARCHITECTURE.md', path: 'ARCHITECTURE.md' },
		{ name: 'README.md', path: 'README.md' },
		{ name: 'CLAUDE.md', path: 'CLAUDE.md' },
		{ name: 'CHANGELOG.md', path: 'CHANGELOG.md' },
	];

	onMount(() => loadDocList());
</script>

<div class="p-6 h-full flex flex-col">
	<div class="mb-4">
		<h1 class="text-lg font-semibold text-text">Docs</h1>
		<p class="text-xs text-text-muted mt-0.5">Project documentation viewer</p>
	</div>

	<div class="flex gap-4 flex-1 min-h-0">
		<!-- Doc sidebar -->
		<div class="w-56 shrink-0 bg-bg-card border border-border rounded-lg overflow-y-auto">
			<div class="px-4 py-2.5 border-b border-border">
				<p class="text-[10px] font-semibold text-text-dim uppercase tracking-wider">Documents</p>
			</div>
			{#each knownDocs as doc}
				<button
					onclick={() => loadDoc(doc.path)}
					class="w-full text-left px-4 py-2.5 text-xs border-b border-border/50 transition-colors
						{currentDoc === doc.path ? 'bg-accent/10 text-accent' : 'text-text-muted hover:bg-bg-hover'}"
				>
					📝 {doc.name}
				</button>
			{/each}

			{#if docFiles.length > 0}
				<div class="px-4 py-2.5 border-b border-border mt-2">
					<p class="text-[10px] font-semibold text-text-dim uppercase tracking-wider">Project Files</p>
				</div>
				{#each docFiles as file}
					<button
						onclick={() => file.path.endsWith('.md') ? loadDoc(file.path) : null}
						class="w-full text-left px-4 py-2 text-xs text-text-muted hover:bg-bg-hover transition-colors
							{currentDoc === file.path ? 'bg-accent/10 text-accent' : ''}"
					>
						{file.type === 'directory' ? '📁' : '📝'} {file.name}
					</button>
				{/each}
			{/if}
		</div>

		<!-- Doc content -->
		<div class="flex-1 bg-bg-card border border-border rounded-lg overflow-y-auto">
			{#if error}
				<div class="p-6 text-xs text-error">{error}</div>
			{:else if currentDoc}
				<div class="px-4 py-2.5 border-b border-border flex items-center justify-between sticky top-0 bg-bg-card z-10">
					<span class="text-xs font-mono text-text-muted">{currentDoc}</span>
				</div>
				<div class="p-6">
					{@html renderedHtml}
				</div>
			{:else}
				<div class="flex items-center justify-center h-full text-xs text-text-dim">
					Select a document to view
				</div>
			{/if}
		</div>
	</div>
</div>

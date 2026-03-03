<script lang="ts">
	let currentDir = $state('');
	let items: { name: string; path: string; type: string; size: number; modified: string }[] = $state([]);
	let basePath = $state('');
	let fileContent = $state('');
	let viewingFile = $state('');
	let loading = $state(false);
	let error = $state('');

	async function loadDir(dir: string) {
		loading = true;
		error = '';
		fileContent = '';
		viewingFile = '';
		try {
			const res = await fetch(`/api/files?base=memory&dir=${encodeURIComponent(dir)}`);
			const data = await res.json();
			if (!res.ok) { error = data.error; return; }
			currentDir = data.dir || '';
			basePath = data.base;
			items = data.items;
		} catch { error = 'Failed to load directory'; }
		finally { loading = false; }
	}

	async function openFile(path: string) {
		loading = true;
		error = '';
		try {
			const res = await fetch(`/api/docs?base=memory&path=${encodeURIComponent(path)}`);
			const data = await res.json();
			if (!res.ok) { error = data.error; return; }
			fileContent = data.content;
			viewingFile = path;
		} catch { error = 'Failed to read file'; }
		finally { loading = false; }
	}

	function navigateUp() {
		if (!currentDir) return;
		const parts = currentDir.split('/');
		parts.pop();
		loadDir(parts.join('/'));
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
	}

	function fileIcon(name: string, type: string): string {
		if (type === 'directory') return '📁';
		if (name.endsWith('.md')) return '📝';
		if (name.endsWith('.ts') || name.endsWith('.js')) return '📜';
		if (name.endsWith('.json')) return '📋';
		if (name.endsWith('.py')) return '🐍';
		if (name.endsWith('.sql')) return '🗄';
		if (name.endsWith('.yml') || name.endsWith('.yaml')) return '⚙';
		if (name.endsWith('.toml') || name.endsWith('.cfg')) return '⚙';
		if (name.endsWith('.log') || name.endsWith('.txt')) return '📃';
		return '📄';
	}

	// Load root on mount
	import { onMount } from 'svelte';
	onMount(() => loadDir(''));
</script>

<div class="p-6 h-full flex flex-col">
	<div class="mb-4">
		<h1 class="text-lg font-semibold text-text">Memory</h1>
		<p class="text-xs text-text-muted mt-0.5">Workspace memory files and configs</p>
	</div>

	<!-- Breadcrumb -->
	<div class="flex items-center gap-1 mb-4 text-xs">
		<button onclick={() => loadDir('')} class="text-accent hover:underline">~/.openclaw/workspace</button>
		{#if currentDir}
			{#each currentDir.split('/') as part, i}
				<span class="text-text-dim">/</span>
				<button
					onclick={() => loadDir(currentDir.split('/').slice(0, i + 1).join('/'))}
					class="text-accent hover:underline"
				>{part}</button>
			{/each}
		{/if}
	</div>

	{#if error}
		<div class="bg-error/10 border border-error/30 rounded-lg p-4 text-xs text-error mb-4">{error}</div>
	{/if}

	<div class="flex gap-4 flex-1 min-h-0">
		<!-- File list -->
		<div class="w-72 shrink-0 bg-bg-card border border-border rounded-lg overflow-y-auto">
			{#if currentDir}
				<button
					onclick={navigateUp}
					class="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-text-muted hover:bg-bg-hover transition-colors border-b border-border/50"
				>
					<span>⬆</span>
					<span>..</span>
				</button>
			{/if}
			{#each items as item}
				<button
					onclick={() => item.type === 'directory' ? loadDir(item.path) : openFile(item.path)}
					class="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-bg-hover transition-colors border-b border-border/50 text-left
						{viewingFile === item.path ? 'bg-accent/10 text-accent' : 'text-text-muted'}"
				>
					<span>{fileIcon(item.name, item.type)}</span>
					<span class="flex-1 truncate">{item.name}</span>
					{#if item.type === 'file'}
						<span class="text-text-dim text-[10px]">{formatSize(item.size)}</span>
					{/if}
				</button>
			{/each}
			{#if items.length === 0 && !loading}
				<div class="px-4 py-8 text-center text-xs text-text-dim">Empty directory</div>
			{/if}
		</div>

		<!-- File content -->
		<div class="flex-1 bg-bg-card border border-border rounded-lg overflow-y-auto">
			{#if viewingFile}
				<div class="px-4 py-2.5 border-b border-border flex items-center justify-between">
					<span class="text-xs font-mono text-text-muted">{viewingFile}</span>
					<button onclick={() => { viewingFile = ''; fileContent = ''; }} class="text-xs text-text-dim hover:text-text">✕</button>
				</div>
				<pre class="p-4 text-xs font-mono text-text-muted whitespace-pre-wrap leading-5">{fileContent}</pre>
			{:else}
				<div class="flex items-center justify-center h-full text-xs text-text-dim">
					Select a file to view its contents
				</div>
			{/if}
		</div>
	</div>

	{#if basePath}
		<div class="mt-3 text-[10px] text-text-dim">Base: {basePath}</div>
	{/if}
</div>

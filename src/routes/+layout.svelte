<script lang="ts">
	import '../app.css';
	let { children } = $props();

	const nav = [
		{ href: '/', label: 'Pipeline', icon: '⚡' },
		{ href: '/projects', label: 'Projects', icon: '📦' },
		{ href: '/activity', label: 'Activity', icon: '📋' },
		{ href: '/agents', label: 'Agents', icon: '🤖' },
	];
</script>

<div class="flex h-screen overflow-hidden">
	<!-- Sidebar -->
	<nav class="w-56 shrink-0 border-r border-border bg-bg flex flex-col">
		<div class="p-4 border-b border-border">
			<h1 class="text-sm font-semibold text-text flex items-center gap-2">
				<span class="text-accent">◆</span> Pipeline
			</h1>
			<p class="text-xs text-text-dim mt-0.5">Anti-Slop Engine</p>
		</div>
		<div class="flex-1 p-2 space-y-0.5">
			{#each nav as item}
				<a
					href={item.href}
					class="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-text-muted hover:text-text hover:bg-bg-hover transition-colors"
				>
					<span class="text-base">{item.icon}</span>
					{item.label}
				</a>
			{/each}
		</div>
		<div class="p-4 border-t border-border">
			<p class="text-xs text-text-dim">v0.1.0 · Local</p>
		</div>
	</nav>

	<!-- Main content -->
	<main class="flex-1 overflow-y-auto bg-bg">
		{@render children()}
	</main>
</div>

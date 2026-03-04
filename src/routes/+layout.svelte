<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { formatTimestamp } from '$lib/time-utils';

	let { children } = $props();

	let sidebarCollapsed = $state(false);
	let activityEvents: { agent: string; message: string; created_at: string; type: string }[] = $state([]);

	const nav = [
		{ href: '/', label: 'Tasks', icon: '▣', section: 'main' },
		{ href: '/agents', label: 'Agents', icon: '⬡', section: 'main' },
		{ href: '/projects', label: 'Projects', icon: '◈', section: 'main' },
		{ href: '/pipeline', label: 'Pipeline', icon: '▷', section: 'main' },
		{ href: '/activity', label: 'Activity', icon: '◉', section: 'main' },
		{ href: '/memory', label: 'Memory', icon: '⧉', section: 'tools' },
		{ href: '/docs', label: 'Docs', icon: '▤', section: 'tools' },
		{ href: '/system', label: 'System', icon: '⬢', section: 'tools' },
	];

	const agentColors: Record<string, string> = {
		scout: 'text-scout',
		builder: 'text-builder',
		gatekeeper: 'text-gatekeeper',
		reviewer: 'text-reviewer',
		qa: 'text-qa',
		coordinator: 'text-accent',
		'claude-sonnet': 'text-scout',
		'codex-gpt': 'text-reviewer',
		automated: 'text-gatekeeper',
	};

	function agentColor(agent: string | null): string {
		if (!agent) return 'text-text-dim';
		const lower = agent.toLowerCase();
		for (const [key, val] of Object.entries(agentColors)) {
			if (lower.includes(key)) return val;
		}
		return 'text-accent';
	}

	function agentLabel(agent: string | null): string {
		if (!agent) return 'System';
		if (agent.includes('sonnet')) return 'Scout';
		if (agent.includes('codex')) return 'Reviewer';
		if (agent === 'automated') return 'Gatekeeper';
		if (agent === 'coordinator') return 'Coordinator';
		return agent;
	}



	// Fetch activity for right panel
	async function fetchActivity() {
		try {
			const res = await fetch('/api/activity?limit=30');
			const data = await res.json();
			activityEvents = data.events || [];
		} catch { /* ignore */ }
	}

	let activityInterval: ReturnType<typeof setInterval>;
	onMount(() => {
		fetchActivity();
		activityInterval = setInterval(fetchActivity, 5000);
	});
	onDestroy(() => clearInterval(activityInterval));

	function isActive(href: string, currentPath: string): boolean {
		if (href === '/') return currentPath === '/';
		return currentPath.startsWith(href);
	}

	const mainNav = $derived(nav.filter(n => n.section === 'main'));
	const toolsNav = $derived(nav.filter(n => n.section === 'tools'));
</script>

<div class="flex h-screen overflow-hidden">
	<!-- Sidebar -->
	<nav class="shrink-0 border-r border-border bg-bg-sidebar flex flex-col transition-all duration-200 {sidebarCollapsed ? 'w-14' : 'w-[180px]'}">
		<!-- Logo -->
		<div class="p-3 border-b border-border flex items-center {sidebarCollapsed ? 'justify-center' : 'gap-2'}">
			<button onclick={() => sidebarCollapsed = !sidebarCollapsed} class="text-accent text-lg hover:opacity-80 transition-opacity" title="Toggle sidebar">
				◆
			</button>
			{#if !sidebarCollapsed}
				<div>
					<h1 class="text-sm font-semibold text-text leading-tight">OpenClaw</h1>
					<p class="text-[10px] text-text-dim">Mission Control</p>
				</div>
			{/if}
		</div>

		<!-- Nav items -->
		<div class="flex-1 py-2 px-1.5 space-y-0.5 overflow-y-auto">
			{#each mainNav as item}
				<a
					href={item.href}
					class="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors
						{isActive(item.href, $page.url.pathname)
							? 'bg-accent/10 text-accent font-medium'
							: 'text-text-muted hover:text-text hover:bg-bg-hover'}"
					title={sidebarCollapsed ? item.label : ''}
				>
					<span class="text-sm w-5 text-center shrink-0">{item.icon}</span>
					{#if !sidebarCollapsed}
						{item.label}
					{/if}
				</a>
			{/each}

			<div class="border-t border-border my-2 mx-2"></div>

			{#each toolsNav as item}
				<a
					href={item.href}
					class="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors
						{isActive(item.href, $page.url.pathname)
							? 'bg-accent/10 text-accent font-medium'
							: 'text-text-muted hover:text-text hover:bg-bg-hover'}"
					title={sidebarCollapsed ? item.label : ''}
				>
					<span class="text-sm w-5 text-center shrink-0">{item.icon}</span>
					{#if !sidebarCollapsed}
						{item.label}
					{/if}
				</a>
			{/each}
		</div>

		<!-- Footer -->
		<div class="p-3 border-t border-border {sidebarCollapsed ? 'text-center' : ''}">
			{#if !sidebarCollapsed}
				<div class="flex items-center gap-2">
					<span class="w-2 h-2 rounded-full bg-accent"></span>
					<p class="text-[10px] text-text-dim">v0.2.0 · Local</p>
				</div>
			{:else}
				<span class="w-2 h-2 rounded-full bg-accent inline-block"></span>
			{/if}
		</div>
	</nav>

	<!-- Main content -->
	<main class="flex-1 overflow-y-auto bg-bg min-w-0">
		{@render children()}
	</main>

	<!-- Right panel - Live Activity -->
	<aside class="w-[250px] shrink-0 border-l border-border bg-bg-sidebar flex flex-col overflow-hidden max-lg:hidden">
		<div class="px-4 py-3 border-b border-border flex items-center justify-between">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
				<h2 class="text-xs font-semibold text-text">Live Activity</h2>
			</div>
			<a href="/activity" class="text-[10px] text-text-dim hover:text-text">View all</a>
		</div>
		<div class="flex-1 overflow-y-auto py-2 px-3 space-y-0">
			{#each activityEvents as event}
				<div class="py-2 border-b border-border/50 last:border-0">
					<div class="flex items-center gap-1.5 mb-0.5">
						<span class="text-[11px] font-medium {agentColor(event.agent)}">{agentLabel(event.agent)}</span>
						<span class="text-[10px] text-text-dim ml-auto">{formatTimestamp(event.created_at)}</span>
					</div>
					<p class="text-[11px] text-text-muted leading-snug">{event.message}</p>
				</div>
			{/each}
			{#if activityEvents.length === 0}
				<p class="text-xs text-text-dim text-center py-8">No activity yet</p>
			{/if}
		</div>
	</aside>
</div>

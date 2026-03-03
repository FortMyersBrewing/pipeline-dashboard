<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let refreshInterval: ReturnType<typeof setInterval>;
	onMount(() => { refreshInterval = setInterval(() => invalidateAll(), 5000); });
	onDestroy(() => clearInterval(refreshInterval));

	function timeAgo(date: string): string {
		const ms = Date.now() - new Date(date).getTime();
		const min = Math.floor(ms / 60000);
		if (min < 1) return 'just now';
		if (min < 60) return `${min}m ago`;
		const hr = Math.floor(min / 60);
		if (hr < 24) return `${hr}h ago`;
		return `${Math.floor(hr / 24)}d ago`;
	}

	function typeIcon(type: string): string {
		const icons: Record<string, string> = {
			stage_start: '▶', stage_pass: '✓', stage_fail: '✗',
			retry: '↻', escalation: '!', merge: '⊕', note: '●',
		};
		return icons[type] || '●';
	}

	function typeColor(type: string): string {
		if (type === 'stage_pass' || type === 'merge') return 'text-success';
		if (type === 'stage_fail' || type === 'escalation') return 'text-error';
		if (type === 'retry') return 'text-warning';
		if (type === 'stage_start') return 'text-info';
		return 'text-text-dim';
	}

	const agentColorMap: Record<string, string> = {
		'claude-sonnet': 'text-scout',
		'codex-gpt': 'text-reviewer',
		'automated': 'text-gatekeeper',
		'coordinator': 'text-accent',
	};

	function agentColor(agent: string | null): string {
		if (!agent) return 'text-text-dim';
		for (const [key, val] of Object.entries(agentColorMap)) {
			if (agent.includes(key)) return val;
		}
		return 'text-text-muted';
	}
</script>

<div class="p-6">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-lg font-semibold text-text">Activity</h1>
			<p class="text-xs text-text-muted mt-0.5">Pipeline event log</p>
		</div>
		<div class="flex items-center gap-2">
			<span class="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
			<span class="text-[10px] text-text-dim">Auto-refresh</span>
		</div>
	</div>

	<div class="bg-bg-card border border-border rounded-lg overflow-hidden">
		{#each data.events as event, i}
			<div class="flex items-start gap-4 px-4 py-3 hover:bg-bg-hover transition-colors {i < data.events.length - 1 ? 'border-b border-border/50' : ''}">
				<span class="text-sm mt-0.5 w-4 text-center {typeColor(event.type)}">{typeIcon(event.type)}</span>
				<div class="flex-1 min-w-0">
					<p class="text-xs text-text leading-snug">{event.message}</p>
					<div class="flex items-center gap-3 mt-1">
						{#if event.task_title}
							<span class="text-[10px] text-text-dim font-mono">{event.task_id}</span>
							<span class="text-[10px] text-text-muted">{event.task_title}</span>
							{#if event.project_name}
								<span class="text-[10px] text-text-dim">in {event.project_name}</span>
							{/if}
						{/if}
						{#if event.agent}
							<span class="text-[10px] {agentColor(event.agent)}">· {event.agent}</span>
						{/if}
					</div>
				</div>
				<span class="text-[10px] text-text-dim shrink-0 mt-0.5">{timeAgo(event.created_at)}</span>
			</div>
		{/each}
		{#if data.events.length === 0}
			<div class="px-4 py-12 text-center text-xs text-text-dim">No events recorded</div>
		{/if}
	</div>
</div>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import { STAGE_LABELS } from '$lib/types';
	import { formatTimestamp } from '$lib/time-utils';

	let { data }: { data: PageData } = $props();

	let refreshInterval: ReturnType<typeof setInterval>;
	onMount(() => { refreshInterval = setInterval(() => invalidateAll(), 5000); });
	onDestroy(() => clearInterval(refreshInterval));



	function durationStr(ms: number | null): string {
		if (!ms) return '—';
		if (ms < 1000) return `${ms}ms`;
		const sec = Math.round(ms / 1000);
		if (sec < 60) return `${sec}s`;
		return `${Math.floor(sec / 60)}m ${sec % 60}s`;
	}

	let expandedRun: number | null = $state(null);
</script>

<div class="p-6">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-lg font-semibold text-text">Pipeline</h1>
			<p class="text-xs text-text-muted mt-0.5">Run history and execution logs</p>
		</div>
		<div class="flex items-center gap-2">
			<span class="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
			<span class="text-[10px] text-text-dim">Auto-refresh</span>
		</div>
	</div>

	<!-- Stats -->
	<div class="grid grid-cols-5 gap-3 mb-6">
		<div class="bg-bg-card border border-border rounded-lg p-3">
			<p class="text-[10px] text-text-dim uppercase tracking-wider">Total Runs</p>
			<p class="text-xl font-semibold text-text mt-1">{data.stats.total}</p>
		</div>
		<div class="bg-bg-card border border-border rounded-lg p-3">
			<p class="text-[10px] text-text-dim uppercase tracking-wider">Passed</p>
			<p class="text-xl font-semibold text-success mt-1">{data.stats.passed}</p>
		</div>
		<div class="bg-bg-card border border-border rounded-lg p-3">
			<p class="text-[10px] text-text-dim uppercase tracking-wider">Failed</p>
			<p class="text-xl font-semibold text-error mt-1">{data.stats.failed}</p>
		</div>
		<div class="bg-bg-card border border-border rounded-lg p-3">
			<p class="text-[10px] text-text-dim uppercase tracking-wider">Active</p>
			<p class="text-xl font-semibold text-info mt-1">{data.stats.active}</p>
		</div>
		<div class="bg-bg-card border border-border rounded-lg p-3">
			<p class="text-[10px] text-text-dim uppercase tracking-wider">Pass Rate</p>
			<p class="text-xl font-semibold text-accent mt-1">{data.stats.passRate}%</p>
		</div>
	</div>

	<!-- Runs table -->
	<div class="bg-bg-card border border-border rounded-lg overflow-hidden">
		<div class="px-4 py-3 border-b border-border">
			<h2 class="text-xs font-semibold text-text uppercase tracking-wider">Run History</h2>
		</div>
		<div class="divide-y divide-border/50">
			{#each data.runs as run}
				<div>
					<button
						onclick={() => expandedRun = expandedRun === run.id ? null : run.id}
						class="w-full flex items-center gap-4 px-4 py-3 text-xs hover:bg-bg-hover transition-colors text-left"
					>
						<span class="w-3 h-3 rounded-full shrink-0
							{run.status === 'passed' ? 'bg-success' : run.status === 'running' ? 'bg-info animate-pulse' : 'bg-error'}"></span>
						<span class="w-20 text-text-muted font-mono">{run.task_id}</span>
						<span class="w-16 text-text-muted">{STAGE_LABELS[run.stage] || run.stage}</span>
						<span class="w-10 text-text-dim">#{run.attempt}</span>
						<span class="flex-1 text-text truncate">{run.task_title}</span>
						<span class="w-16 text-text-dim">{run.agent || '—'}</span>
						<span class="w-16 text-right {run.status === 'passed' ? 'text-success' : run.status === 'running' ? 'text-info' : 'text-error'}">{run.status}</span>
						<span class="w-16 text-right text-text-dim">{durationStr(run.duration_ms)}</span>
						<span class="w-16 text-right text-text-dim">{formatTimestamp(run.started_at)}</span>
					</button>
					{#if expandedRun === run.id && run.result}
						<div class="mx-4 mb-3 p-3 rounded bg-bg border border-border overflow-x-auto max-h-48 overflow-y-auto">
							<pre class="text-xs font-mono text-text-muted whitespace-pre-wrap leading-5">{run.result}</pre>
						</div>
					{/if}
				</div>
			{/each}
			{#if data.runs.length === 0}
				<div class="px-4 py-8 text-center text-xs text-text-dim">No pipeline runs yet</div>
			{/if}
		</div>
	</div>
</div>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll, goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { STACK_TYPE_COLORS } from '$lib/types';

	let { data }: { data: PageData } = $props();

	let refreshInterval: ReturnType<typeof setInterval>;
	onMount(() => { refreshInterval = setInterval(() => invalidateAll(), 10000); });
	onDestroy(() => clearInterval(refreshInterval));

	function getProjectColor(stackType: string): { bg: string; text: string } {
		return STACK_TYPE_COLORS[stackType] || STACK_TYPE_COLORS.default;
	}

	function timeAgo(date: string): string {
		const ms = Date.now() - new Date(date).getTime();
		const min = Math.floor(ms / 60000);
		if (min < 1) return 'just now';
		if (min < 60) return `${min}m ago`;
		const hr = Math.floor(min / 60);
		if (hr < 24) return `${hr}h ago`;
		return `${Math.floor(hr / 24)}d ago`;
	}

	function filterByProject(projectSlug: string) {
		goto(`/?project=${projectSlug}`);
	}
</script>

<div class="p-6">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-lg font-semibold text-text">Projects</h1>
			<p class="text-xs text-text-muted mt-0.5">Registered repositories</p>
		</div>
	</div>

	<div class="space-y-3">
		{#each data.projects as project}
			{@const colors = getProjectColor(project.stack_type)}
			<div class="bg-bg-card border border-border rounded-lg p-5 hover:border-border-light transition-all cursor-pointer group" onclick={() => filterByProject(project.slug)}>
				<div class="flex items-center justify-between mb-3">
					<div class="flex-1">
						<div class="flex items-center gap-3 mb-2">
							<h3 class="text-sm font-semibold text-text">{project.name}</h3>
							<span class="text-[10px] px-2 py-0.5 rounded {colors.bg} {colors.text}">{project.stack_type}</span>
							<span class="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success">{project.status}</span>
						</div>
						<p class="text-[10px] text-text-dim font-mono">{project.repo_path}</p>
					</div>
					<div class="flex items-center gap-2">
						{#if project.repo_url}
							<a href={project.repo_url} target="_blank" onclick={(e) => e.stopPropagation()} class="text-xs text-accent hover:text-accent-hover transition-colors">GitHub →</a>
						{/if}
						<button onclick={() => filterByProject(project.slug)} class="text-xs text-text-dim group-hover:text-accent transition-colors">View Tasks →</button>
					</div>
				</div>
				<div class="flex items-center gap-4 text-xs">
					<span class="text-text-muted">{project.total_tasks} total tasks</span>
					{#if project.task_counts?.done}
						<span class="text-success">{project.task_counts.done} done</span>
					{/if}
					{#each Object.entries(project.task_counts || {}).filter(([k]) => !['done', 'queued'].includes(k)) as [status, count]}
						<span class="text-info">{count} {status}</span>
					{/each}
					{#if project.task_counts?.queued}
						<span class="text-text-dim">{project.task_counts.queued} queued</span>
					{/if}
				</div>
				<div class="mt-3 text-[10px] text-text-dim">
					Updated {timeAgo(project.updated_at)}
				</div>
			</div>
		{/each}
		{#if data.projects.length === 0}
			<div class="text-center py-12 text-xs text-text-dim">No projects registered</div>
		{/if}
	</div>
</div>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let refreshInterval: ReturnType<typeof setInterval>;
	onMount(() => { refreshInterval = setInterval(() => invalidateAll(), 10000); });
	onDestroy(() => clearInterval(refreshInterval));
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
			<div class="bg-bg-card border border-border rounded-lg p-5 hover:border-border-light transition-all">
				<div class="flex items-center justify-between mb-3">
					<div>
						<h3 class="text-sm font-semibold text-text">{project.name}</h3>
						<p class="text-[10px] text-text-dim font-mono mt-1">{project.repo_path}</p>
					</div>
					{#if project.repo_url}
						<a href={project.repo_url} target="_blank" class="text-xs text-accent hover:text-accent-hover transition-colors">GitHub →</a>
					{/if}
				</div>
				<div class="flex items-center gap-4 text-xs">
					<span class="text-text-muted">{project.total_tasks} tasks</span>
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
			</div>
		{/each}
		{#if data.projects.length === 0}
			<div class="text-center py-12 text-xs text-text-dim">No projects registered</div>
		{/if}
	</div>
</div>

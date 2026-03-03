<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<div class="p-8">
	<div class="mb-8">
		<h1 class="text-xl font-semibold text-text">Projects</h1>
		<p class="text-sm text-text-muted mt-1">Registered repositories</p>
	</div>

	<div class="space-y-3">
		{#each data.projects as project}
			<div class="border border-border rounded-lg p-5 hover:border-border-light hover:bg-bg-card transition-all">
				<div class="flex items-center justify-between mb-3">
					<div>
						<h3 class="text-sm font-semibold text-text">{project.name}</h3>
						<p class="text-xs text-text-dim font-mono mt-1">{project.repo_path}</p>
					</div>
					{#if project.repo_url}
						<a href={project.repo_url} target="_blank" class="text-xs text-accent hover:text-accent-hover">GitHub →</a>
					{/if}
				</div>
				<div class="flex items-center gap-4 text-xs">
					<span class="text-text-muted">{project.total_tasks} tasks</span>
					{#if project.task_counts.done}
						<span class="text-[#22C55E]">{project.task_counts.done} done</span>
					{/if}
					{#each Object.entries(project.task_counts).filter(([k]) => !['done', 'queued'].includes(k)) as [status, count]}
						<span class="text-[#8B5CF6]">{count} {status}</span>
					{/each}
					{#if project.task_counts.queued}
						<span class="text-text-dim">{project.task_counts.queued} queued</span>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

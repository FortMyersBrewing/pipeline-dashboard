<script lang="ts">
	import type { PageData } from './$types';
	import { STAGES, STAGE_LABELS } from '$lib/types';
	import type { Task, Run } from '$lib/types';

	let { data }: { data: PageData } = $props();

	const inProgress = $derived(data.tasks.filter((t: Task) => !['queued', 'done', 'failed', 'paused'].includes(t.status)));
	const queued = $derived(data.tasks.filter((t: Task) => t.status === 'queued'));
	const completed = $derived(data.tasks.filter((t: Task) => ['done', 'failed', 'paused'].includes(t.status)));

	let selectedTask: (Task & { runs?: Run[] }) | null = $state(null);

	function getStageStatus(task: Task & { runs?: Run[] }, stage: string): 'idle' | 'running' | 'passed' | 'failed' {
		const runs = task.runs || [];
		const stageRuns = runs.filter((r: Run) => r.stage === stage && r.attempt === task.attempt);
		if (stageRuns.length === 0) return 'idle';
		const latest = stageRuns[stageRuns.length - 1];
		if (latest.status === 'running') return 'running';
		if (latest.status === 'passed') return 'passed';
		return 'failed';
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

	function priorityColor(p: string): string {
		if (p === 'urgent') return 'text-error';
		if (p === 'high') return 'text-warning';
		return 'text-text-dim';
	}

	function statusColor(s: string): string {
		if (s === 'done') return 'bg-[rgba(34,197,94,0.1)] text-[#22C55E]';
		if (s === 'failed') return 'bg-[rgba(239,68,68,0.1)] text-[#EF4444]';
		if (s === 'paused') return 'bg-[rgba(234,179,8,0.1)] text-[#EAB308]';
		if (s === 'queued') return 'bg-[rgba(113,113,122,0.1)] text-[#71717A]';
		return 'bg-[rgba(139,92,246,0.1)] text-[#8B5CF6]';
	}
</script>

<div class="p-8">
	<div class="flex items-center justify-between mb-8">
		<div>
			<h1 class="text-xl font-semibold text-text">Pipeline</h1>
			<p class="text-sm text-text-muted mt-1">Active development tasks</p>
		</div>
		<div class="flex items-center gap-2 text-xs text-text-dim">
			<span class="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse"></span>
			Auto-refresh · 5s
		</div>
	</div>

	<!-- In Progress -->
	{#if inProgress.length > 0}
		<section class="mb-8">
			<h2 class="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">In Progress</h2>
			<div class="space-y-2">
				{#each inProgress as task}
					<button
						onclick={() => selectedTask = selectedTask?.id === task.id ? null : task}
						class="w-full text-left border border-border rounded-lg p-4 hover:border-border-light hover:bg-bg-card transition-all cursor-pointer"
					>
						<div class="flex items-center justify-between mb-3">
							<div class="flex items-center gap-3">
								<span class={`text-xs font-mono ${priorityColor(task.priority)}`}>{task.id}</span>
								<span class="text-sm font-medium text-text">{task.title}</span>
							</div>
							<div class="flex items-center gap-3">
								<span class="text-xs text-text-dim">Attempt {task.attempt}/{task.max_attempts}</span>
								<span class={`text-xs px-2 py-0.5 rounded-full ${statusColor(task.status)}`}>{task.status}</span>
							</div>
						</div>

						<!-- Stage dots -->
						<div class="flex items-center gap-1">
							{#each STAGES as stage, i}
								{@const s = getStageStatus(task, stage)}
								<div class="flex items-center gap-1">
									<div class="flex flex-col items-center">
										<div
											class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all
												{s === 'running' ? 'bg-[rgba(139,92,246,0.2)] text-[#8B5CF6] ring-2 ring-[#8B5CF6] animate-pulse' :
												 s === 'passed' ? 'bg-[rgba(34,197,94,0.2)] text-[#22C55E]' :
												 s === 'failed' ? 'bg-[rgba(239,68,68,0.2)] text-[#EF4444]' :
												 'bg-[rgba(113,113,122,0.1)] text-[#52525B]'}"
										>
											{s === 'passed' ? '✓' : s === 'failed' ? '✗' : s === 'running' ? '●' : (i + 1)}
										</div>
										<span class="text-[10px] mt-1 {s === 'running' ? 'text-[#8B5CF6]' : s === 'passed' ? 'text-[#22C55E]' : 'text-[#52525B]'}">{STAGE_LABELS[stage]}</span>
									</div>
									{#if i < STAGES.length - 1}
										<div class="w-8 h-px mx-1 {s === 'passed' ? 'bg-[#22C55E]' : 'bg-[#1E1E2E]'} mb-4"></div>
									{/if}
								</div>
							{/each}
						</div>
					</button>

					<!-- Detail panel -->
					{#if selectedTask?.id === task.id}
						<div class="border border-border-light rounded-lg p-6 bg-bg-card ml-4 animate-in">
							<div class="flex items-center justify-between mb-4">
								<h3 class="text-sm font-semibold text-text">{task.title}</h3>
								<button onclick={() => selectedTask = null} class="text-text-dim hover:text-text text-sm">✕</button>
							</div>
							{#if task.description}
								<p class="text-sm text-text-muted mb-4">{task.description}</p>
							{/if}

							<!-- Runs timeline -->
							<h4 class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Pipeline Runs</h4>
							<div class="space-y-1.5 mb-4">
								{#each (task.runs || []) as run}
									<div class="flex items-center gap-3 text-xs">
										<span class="text-text-dim font-mono w-6">#{run.attempt}</span>
										<span class="w-20 text-text-muted">{STAGE_LABELS[run.stage] || run.stage}</span>
										<span class="w-20">{run.agent || '—'}</span>
										<span class="{run.status === 'passed' ? 'text-[#22C55E]' : run.status === 'running' ? 'text-[#8B5CF6]' : run.status === 'rejected' ? 'text-[#EF4444]' : 'text-[#EF4444]'}">
											{run.status}
										</span>
										{#if run.duration_ms}
											<span class="text-text-dim">{Math.round(run.duration_ms / 1000)}s</span>
										{/if}
										{#if run.result}
											<span class="text-text-dim truncate max-w-xs" title={run.result}>{run.result}</span>
										{/if}
									</div>
								{/each}
							</div>

							<!-- Recent events -->
							<h4 class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Recent Events</h4>
							<div class="space-y-1.5">
								{#each (task.events || []).slice(0, 5) as event}
									<div class="flex items-center gap-3 text-xs">
										<span class="text-text-dim">{timeAgo(event.created_at)}</span>
										<span class="text-text-muted">{event.agent || ''}</span>
										<span class="text-text">{event.message}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</section>
	{/if}

	<!-- Queued -->
	{#if queued.length > 0}
		<section class="mb-8">
			<h2 class="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">Queued</h2>
			<div class="space-y-2">
				{#each queued as task}
					<div class="border border-border rounded-lg p-4 opacity-60 hover:opacity-80 transition-opacity">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<span class={`text-xs font-mono ${priorityColor(task.priority)}`}>{task.id}</span>
								<span class="text-sm text-text-muted">{task.title}</span>
							</div>
							<span class={`text-xs px-2 py-0.5 rounded-full ${statusColor('queued')}`}>queued</span>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Completed -->
	{#if completed.length > 0}
		<section>
			<h2 class="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">Completed</h2>
			<div class="space-y-2">
				{#each completed as task}
					<div class="border border-border rounded-lg p-4 opacity-50 hover:opacity-70 transition-opacity">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<span class="text-xs font-mono text-text-dim">{task.id}</span>
								<span class="text-sm text-text-muted">{task.title}</span>
							</div>
							<span class={`text-xs px-2 py-0.5 rounded-full ${statusColor(task.status)}`}>{task.status}</span>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>

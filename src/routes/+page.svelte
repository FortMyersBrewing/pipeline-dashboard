<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import { STAGES, STAGE_LABELS, STACK_TYPE_COLORS } from '$lib/types';
	import type { Task, Run } from '$lib/types';

	let { data }: { data: PageData } = $props();

	// Kanban columns
	const backlog = $derived(data.tasks.filter((t: Task) => t.status === 'queued'));
	const inProgress = $derived(data.tasks.filter((t: Task) => ['in_progress', 'scouting', 'building', 'gating'].includes(t.status)));
	const review = $derived(data.tasks.filter((t: Task) => ['reviewing', 'testing', 'review'].includes(t.status)));
	const complete = $derived(data.tasks.filter((t: Task) => ['done', 'failed', 'paused'].includes(t.status)));

	let filterProject = $state('all');
	
	// Set initial filter from URL params
	$effect(() => {
		const projectParam = $page.url.searchParams.get('project');
		if (projectParam) {
			filterProject = projectParam;
		}
	});
	let showNewTask = $state(false);
	let newTask = $state({ id: '', title: '', description: '', project_id: '', priority: 'medium' });
	let reviewComments = $state<Record<string, string>>({}); // taskId -> comment

	// Auto-refresh
	let refreshInterval: ReturnType<typeof setInterval>;
	onMount(() => {
		refreshInterval = setInterval(() => invalidateAll(), 5000);
	});
	onDestroy(() => clearInterval(refreshInterval));

	// Live log streaming
	let logLines: string[] = $state([]);
	let logOpen = $state(false);
	let logTaskId: string | null = $state(null);
	let eventSource: EventSource | null = $state(null);
	let logContainer: HTMLElement | null = $state(null);

	function toggleLog(taskId: string) {
		if (logOpen && logTaskId === taskId) {
			eventSource?.close();
			logOpen = false;
			logTaskId = null;
			logLines = [];
			return;
		}
		eventSource?.close();
		logLines = [];
		logTaskId = taskId;
		logOpen = true;
		eventSource = new EventSource(`/api/logs/${taskId}`);
		eventSource.onmessage = (e) => {
			const data = JSON.parse(e.data);
			if (data.line) {
				logLines = [...logLines, data.line];
				setTimeout(() => logContainer?.scrollTo(0, logContainer.scrollHeight), 10);
			}
		};
	}

	onDestroy(() => eventSource?.close());

	function timeAgo(date: string): string {
		const ms = Date.now() - new Date(date).getTime();
		const min = Math.floor(ms / 60000);
		if (min < 1) return 'just now';
		if (min < 60) return `${min}m ago`;
		const hr = Math.floor(min / 60);
		if (hr < 24) return `${hr}h ago`;
		return `${Math.floor(hr / 24)}d ago`;
	}

	function priorityDot(p: string): string {
		if (p === 'urgent') return 'bg-error';
		if (p === 'high') return 'bg-warning';
		if (p === 'medium') return 'bg-info';
		return 'bg-text-dim';
	}

	function statusBadgeColor(s: string): string {
		if (s === 'done') return 'bg-success/10 text-success';
		if (s === 'failed') return 'bg-error/10 text-error';
		if (s === 'paused') return 'bg-warning/10 text-warning';
		return '';
	}

	function agentAvatar(task: Task): string {
		if (!task.current_stage) return '◆';
		const map: Record<string, string> = { scout: '🔍', builder: '🏗', gatekeeper: '🚦', reviewer: '👁', qa: '🧪' };
		return map[task.current_stage] || '◆';
	}

	function getFailureSummary(task: Task): { stage: string; attempts: number } {
		if (!task.runs || task.runs.length === 0) return { stage: 'unknown', attempts: task.attempt };
		
		const failedRuns = task.runs.filter((r: Run) => r.status === 'failed');
		const lastFailedRun = failedRuns[failedRuns.length - 1];
		const stage = lastFailedRun?.stage || task.current_stage || 'unknown';
		
		return { stage, attempts: task.attempt };
	}

	async function retryTask(taskId: string, comment: string) {
		// Store the comment as an event
		if (comment.trim()) {
			await fetch(`/api/tasks/${taskId}/events`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: 'review',
					message: comment.trim(),
					agent: 'human'
				}),
			});
		}
		
		// Reset task to queued with attempt 0
		await fetch(`/api/tasks/${taskId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				status: 'queued',
				attempt: 0
			}),
		});
		
		invalidateAll();
	}

	async function dismissTask(taskId: string) {
		await fetch(`/api/tasks/${taskId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				status: 'failed'
			}),
		});
		
		invalidateAll();
	}

	async function startTask(taskId: string) {
		await fetch(`/api/tasks/${taskId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				status: 'in_progress',
				current_stage: 'builder',
				attempt: 1
			}),
		});
		
		invalidateAll();
	}

	function getRunCount(task: Task): number {
		return task.runs ? task.runs.length : 0;
	}

	function getProjectColor(stackType: string): { bg: string; text: string } {
		return STACK_TYPE_COLORS[stackType] || STACK_TYPE_COLORS.default;
	}

	async function createTask() {
		if (!newTask.title || !newTask.project_id) return;
		const id = newTask.id || `task-${Date.now().toString(36)}`;
		await fetch('/api/tasks', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...newTask, id }),
		});
		showNewTask = false;
		newTask = { id: '', title: '', description: '', project_id: '', priority: 'medium' };
		invalidateAll();
	}

	const columns = $derived([
		{ title: 'Backlog', tasks: backlog, color: 'text-text-dim' },
		{ title: 'In Progress', tasks: inProgress, color: 'text-info' },
		{ title: 'Review', tasks: review, color: 'text-warning' },
		{ title: 'Complete', tasks: complete, color: 'text-success' },
	]);
</script>

<div class="flex flex-col h-full">
	<!-- Stats bar -->
	<div class="border-b border-border px-6 py-3 flex items-center gap-6 shrink-0">
		<div class="flex items-center gap-6 text-xs">
			<div class="flex items-center gap-2">
				<span class="text-text-dim">This week</span>
				<span class="text-text font-semibold text-sm">{data.stats.thisWeek}</span>
			</div>
			<div class="w-px h-4 bg-border"></div>
			<div class="flex items-center gap-2">
				<span class="text-text-dim">In progress</span>
				<span class="text-info font-semibold text-sm">{data.stats.inProgress}</span>
			</div>
			<div class="w-px h-4 bg-border"></div>
			<div class="flex items-center gap-2">
				<span class="text-text-dim">Total</span>
				<span class="text-text font-semibold text-sm">{data.stats.total}</span>
			</div>
			<div class="w-px h-4 bg-border"></div>
			<div class="flex items-center gap-2">
				<span class="text-text-dim">Completion</span>
				<span class="text-accent font-semibold text-sm">{data.stats.completion}%</span>
			</div>
		</div>
		<div class="ml-auto flex items-center gap-2">
			<span class="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
			<span class="text-[10px] text-text-dim">Live · 5s</span>
		</div>
	</div>

	<!-- Action bar -->
	<div class="px-6 py-3 flex items-center gap-3 shrink-0 border-b border-border/50">
		<button
			onclick={() => showNewTask = !showNewTask}
			class="px-4 py-1.5 rounded-full bg-accent text-bg text-xs font-medium hover:bg-accent-hover transition-colors"
		>
			+ New task
		</button>

		<div class="flex items-center gap-2 ml-4">
			<select
				bind:value={filterProject}
				class="bg-bg-card border border-border rounded-md px-3 py-1.5 text-xs text-text-muted focus:outline-none focus:border-accent"
			>
				<option value="all">All projects</option>
				{#each data.projects as project}
					<option value={project.id}>{project.name}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- New task form -->
	{#if showNewTask}
		<div class="px-6 py-4 border-b border-border bg-bg-card/50">
			<div class="flex items-start gap-3 max-w-2xl">
				<div class="flex-1 space-y-2">
					<input
						bind:value={newTask.title}
						placeholder="Task title"
						class="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-accent"
					/>
					<textarea
						bind:value={newTask.description}
						placeholder="Description (optional)"
						rows="2"
						class="w-full bg-bg border border-border rounded-md px-3 py-2 text-xs text-text placeholder:text-text-dim focus:outline-none focus:border-accent resize-none"
					></textarea>
					<div class="flex items-center gap-2">
						<select bind:value={newTask.project_id} class="bg-bg border border-border rounded-md px-3 py-1.5 text-xs text-text-muted focus:outline-none focus:border-accent">
							<option value="">Select project</option>
							{#each data.projects as project}
								<option value={project.id}>{project.name}</option>
							{/each}
						</select>
						<select bind:value={newTask.priority} class="bg-bg border border-border rounded-md px-3 py-1.5 text-xs text-text-muted focus:outline-none focus:border-accent">
							<option value="low">Low</option>
							<option value="medium">Medium</option>
							<option value="high">High</option>
							<option value="urgent">Urgent</option>
						</select>
						<button onclick={createTask} class="px-4 py-1.5 rounded-md bg-accent text-bg text-xs font-medium hover:bg-accent-hover">Create</button>
						<button onclick={() => showNewTask = false} class="px-3 py-1.5 text-xs text-text-dim hover:text-text">Cancel</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Kanban board -->
	<div class="flex-1 overflow-hidden px-4 py-4">
		<div class="flex gap-4 h-full">
			{#each columns as col}
				{@const filteredTasks = filterProject === 'all' ? col.tasks : col.tasks.filter((t: Task) => t.project_id === filterProject || t.project_slug === filterProject)}
				<div class="flex-1 min-w-[240px] flex flex-col">
					<!-- Column header -->
					<div class="flex items-center gap-2 mb-3 px-1">
						<span class="text-xs font-semibold uppercase tracking-wider {col.color}">{col.title}</span>
						<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-bg-card text-text-dim">{filteredTasks.length}</span>
					</div>

					<!-- Cards -->
					<div class="flex-1 overflow-y-auto kanban-col space-y-2 pr-1">
						{#each filteredTasks as task}
							<div class="bg-bg-card border border-border rounded-lg p-3.5 hover:border-border-light hover:bg-bg-hover transition-all cursor-pointer group">
								<div class="flex items-start gap-2 mb-2">
									<span class="w-2 h-2 rounded-full mt-1.5 shrink-0 {priorityDot(task.priority)}"></span>
									<h3 class="text-[13px] font-medium text-text leading-snug">{task.title}</h3>
								</div>

								{#if task.description}
									<p class="text-[11px] text-text-muted leading-relaxed mb-3 ml-4 line-clamp-2">{task.description}</p>
								{/if}

								<div class="flex items-center justify-between ml-4">
									<div class="flex items-center gap-2">
										<span class="text-xs" title={task.current_stage || 'queued'}>{agentAvatar(task)}</span>
												<span class="text-[10px] px-1.5 py-0.5 rounded {getProjectColor(task.project_stack_type || 'default').bg} {getProjectColor(task.project_stack_type || 'default').text}">{task.project_name || task.project_id}</span>
										<!-- Run count badge for Complete column -->
										{#if ['done', 'failed', 'paused'].includes(task.status) && getRunCount(task) > 0}
											<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-bg-hover text-text-dim">{getRunCount(task)} runs</span>
										{/if}
									</div>
									<div class="flex items-center gap-2">
										<!-- Start button for Backlog column -->
										{#if task.status === 'queued'}
											<button
												onclick={(e) => { e.stopPropagation(); startTask(task.id); }}
												class="px-2 py-1 rounded text-[10px] font-medium bg-accent text-bg hover:bg-accent-hover transition-colors opacity-0 group-hover:opacity-100"
											>
												▶ Start
											</button>
										{/if}
										<span class="text-[10px] text-text-dim">{timeAgo(task.updated_at)}</span>
									</div>
								</div>

								{#if !['queued', 'done', 'failed', 'paused'].includes(task.status)}
									<div class="flex items-center gap-0.5 mt-2.5 ml-4">
										{#each STAGES as stage}
											{@const runs = (task.runs || []).filter((r: Run) => r.stage === stage && r.attempt === task.attempt)}
											{@const latest = runs.length > 0 ? runs[runs.length - 1] : null}
											{@const s = !latest ? 'idle' : latest.status === 'running' ? 'running' : latest.status === 'passed' ? 'passed' : 'failed'}
											<div
												class="h-1 flex-1 rounded-full transition-all
													{s === 'passed' ? 'bg-success' : s === 'running' ? 'bg-info animate-pulse' : s === 'failed' ? 'bg-error' : 'bg-border'}"
												title="{STAGE_LABELS[stage]}: {s}"
											></div>
										{/each}
									</div>
								{/if}

								{#if ['done', 'failed', 'paused'].includes(task.status)}
									<div class="mt-2 ml-4">
										<span class="text-[10px] px-2 py-0.5 rounded-full {statusBadgeColor(task.status)}">{task.status}</span>
									</div>
								{/if}

								<!-- Review UI for tasks needing human intervention -->
								{#if task.status === 'review'}
									{@const failure = getFailureSummary(task)}
									<div class="mt-3 ml-4 space-y-2 border-t border-border/50 pt-2">
										<div class="text-[11px] text-error">
											Failed {failure.attempts}x at {failure.stage}
										</div>
										<textarea
											value={reviewComments[task.id] || ''}
											oninput={(e) => reviewComments[task.id] = (e.target as HTMLTextAreaElement).value}
											placeholder="Add feedback for next attempt..."
											rows="2"
											class="w-full bg-[#1a1a2e] border border-border/50 rounded-md px-2 py-1.5 text-xs text-text placeholder:text-text-dim focus:outline-none focus:border-accent resize-none"
										></textarea>
										<div class="flex items-center gap-2">
											<button
												onclick={(e) => { e.stopPropagation(); retryTask(task.id, reviewComments[task.id] || ''); }}
												class="px-3 py-1 rounded text-[10px] font-medium bg-accent text-bg hover:bg-accent-hover transition-colors"
											>
												Retry
											</button>
											<button
												onclick={(e) => { e.stopPropagation(); dismissTask(task.id); }}
												class="px-3 py-1 rounded text-[10px] font-medium bg-error/20 text-error hover:bg-error/30 transition-colors"
											>
												Dismiss
											</button>
										</div>
									</div>
								{:else}
									<div class="mt-2 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
										<button
											onclick={(e) => { e.stopPropagation(); toggleLog(task.id); }}
											class="text-[10px] px-2 py-0.5 rounded border transition-colors
												{logOpen && logTaskId === task.id
													? 'border-accent text-accent bg-accent/10'
													: 'border-border text-text-dim hover:text-text hover:border-border-light'}"
										>
											{logOpen && logTaskId === task.id ? '■ Stop' : '▶ Log'}
										</button>
									</div>
								{/if}
							</div>
						{/each}
						{#if filteredTasks.length === 0}
							<div class="text-center py-8 text-xs text-text-dim">No tasks</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>

<!-- Live Log Panel -->
{#if logOpen}
	<section class="fixed bottom-0 left-[180px] right-[250px] border-t border-border bg-bg-sidebar z-50 max-lg:right-0">
		<div class="flex items-center justify-between px-4 py-2 border-b border-border">
			<div class="flex items-center gap-2">
				<span class="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
				<span class="text-xs font-medium text-text">Live Output</span>
				<span class="text-xs text-text-dim font-mono">{logTaskId}</span>
				<span class="text-[10px] text-text-dim">{logLines.length} lines</span>
			</div>
			<button onclick={() => toggleLog(logTaskId || '')} class="text-xs text-text-dim hover:text-text">✕</button>
		</div>
		<div
			bind:this={logContainer}
			class="h-48 overflow-y-auto p-3 font-mono text-xs leading-5 text-text-muted"
		>
			{#each logLines as line}
				<div class="{line.includes('✓') || line.includes('PASSED') ? 'text-success' : line.includes('✗') || line.includes('FAILED') ? 'text-error' : line.includes('▶') || line.includes('Attempt') ? 'text-info' : ''}">{line}</div>
			{/each}
		</div>
	</section>
{/if}

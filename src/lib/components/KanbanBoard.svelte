<script lang="ts">
	import type { Task } from '$lib/types';
	import { formatTimestamp } from '$lib/time-utils';
	import { STAGE_LABELS, STATUS_COLORS } from '$lib/types';

	let { 
		tasks,
		projectId,
		onTaskUpdate,
		onTaskCreate
	}: {
		tasks: Task[];
		projectId: string;
		onTaskUpdate?: (taskId: string, updates: Partial<Task>) => Promise<void>;
		onTaskCreate?: (title: string) => Promise<void>;
	} = $props();

	let newTaskTitle = $state('');
	let draggedTask: Task | null = $state(null);
	let dragOverColumn: string | null = $state(null);

	const columns = [
		{ id: 'queued', label: 'Queued', color: 'text-text-muted' },
		{ id: 'dispatching', label: 'In Progress', color: 'text-info' },
		{ id: 'review', label: 'Review', color: 'text-warning' },
		{ id: 'done', label: 'Done', color: 'text-success' },
		{ id: 'failed', label: 'Failed', color: 'text-error' }
	];

	const tasksByStatus = $derived(() => {
		const groups: Record<string, Task[]> = {};
		columns.forEach(col => {
			groups[col.id] = tasks.filter(task => task.status === col.id);
		});
		return groups;
	});

	function getColumnTasks(columnId: string): Task[] {
		return tasksByStatus()[columnId] || [];
	}

	function handleDragStart(event: DragEvent, task: Task) {
		if (!event.dataTransfer) return;
		
		draggedTask = task;
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', task.id);
		
		// Add visual feedback
		const target = event.target as HTMLElement;
		target.classList.add('opacity-50');
	}

	function handleDragEnd(event: DragEvent) {
		draggedTask = null;
		dragOverColumn = null;
		
		// Remove visual feedback
		const target = event.target as HTMLElement;
		target.classList.remove('opacity-50');
	}

	function handleDragOver(event: DragEvent, columnId: string) {
		event.preventDefault();
		event.dataTransfer!.dropEffect = 'move';
		dragOverColumn = columnId;
	}

	function handleDragLeave(event: DragEvent) {
		// Only clear if leaving the column entirely
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		const x = event.clientX;
		const y = event.clientY;
		
		if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
			dragOverColumn = null;
		}
	}

	async function handleDrop(event: DragEvent, newStatus: string) {
		event.preventDefault();
		dragOverColumn = null;
		
		if (!draggedTask || draggedTask.status === newStatus) {
			draggedTask = null;
			return;
		}

		const taskId = draggedTask.id;
		const oldStatus = draggedTask.status;

		try {
			// Optimistic update
			draggedTask.status = newStatus;
			tasks = [...tasks];

			// Update via API
			if (onTaskUpdate) {
				await onTaskUpdate(taskId, { status: newStatus });
			} else {
				// Fallback direct API call
				const response = await fetch(`/api/tasks/${taskId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ status: newStatus })
				});
				
				if (!response.ok) {
					throw new Error('Failed to update task');
				}
			}
		} catch (error) {
			console.error('Failed to update task:', error);
			// Revert optimistic update
			draggedTask.status = oldStatus;
			tasks = [...tasks];
		} finally {
			draggedTask = null;
		}
	}

	async function handleAddTask(event: SubmitEvent) {
		event.preventDefault();
		
		if (!newTaskTitle.trim()) return;

		try {
			if (onTaskCreate) {
				await onTaskCreate(newTaskTitle.trim());
			} else {
				// Fallback direct API call
				const response = await fetch('/api/tasks', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						project_id: projectId,
						title: newTaskTitle.trim(),
						status: 'queued'
					})
				});
				
				if (!response.ok) {
					throw new Error('Failed to create task');
				}
			}
			
			newTaskTitle = '';
		} catch (error) {
			console.error('Failed to create task:', error);
			alert('Failed to create task');
		}
	}

	function getStatusColor(status: string) {
		return STATUS_COLORS[status] || { bg: 'bg-bg', text: 'text-text' };
	}

	function getPriorityColor(priority: string) {
		const colors = {
			low: 'bg-gray-600/20 text-gray-400',
			medium: 'bg-blue-600/20 text-blue-400',
			high: 'bg-orange-600/20 text-orange-400',
			urgent: 'bg-red-600/20 text-red-400'
		};
		return colors[priority as keyof typeof colors] || colors.medium;
	}
</script>

<div class="kanban-board">
	<!-- Quick Add Task -->
	<form onsubmit={handleAddTask} class="mb-6">
		<div class="flex gap-2">
			<input
				bind:value={newTaskTitle}
				placeholder="Add a new task..."
				class="flex-1 px-3 py-2 text-sm bg-bg-card border border-border rounded focus:border-accent focus:outline-none"
			/>
			<button
				type="submit"
				disabled={!newTaskTitle.trim()}
				class="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
			>
				Add Task
			</button>
		</div>
	</form>

	<!-- Kanban Columns -->
	<div class="grid grid-cols-1 md:grid-cols-5 gap-4">
		{#each columns as column}
			{@const columnTasks = getColumnTasks(column.id)}
			{@const isDropTarget = dragOverColumn === column.id}
			
			<div 
				class="kanban-column bg-bg-card border border-border rounded-lg p-3 min-h-96 transition-colors {isDropTarget ? 'border-accent bg-accent/5' : ''}"
				ondragover={(e) => handleDragOver(e, column.id)}
				ondragleave={handleDragLeave}
				ondrop={(e) => handleDrop(e, column.id)}
			>
				<div class="mb-3">
					<h3 class="text-sm font-medium {column.color} flex items-center gap-2">
						{column.label}
						<span class="text-xs bg-bg-hover px-2 py-0.5 rounded-full text-text-muted">
							{columnTasks.length}
						</span>
					</h3>
				</div>

				<div class="space-y-3">
					{#each columnTasks as task}
						{@const statusColors = getStatusColor(task.status)}
						{@const priorityColors = getPriorityColor(task.priority)}
						
						<div
							class="task-card bg-bg border border-border rounded-lg p-3 cursor-move hover:border-border-light transition-all"
							draggable="true"
							ondragstart={(e) => handleDragStart(e, task)}
							ondragend={handleDragEnd}
						>
							<div class="flex items-center gap-2 mb-2">
								<span class="text-[10px] px-2 py-0.5 rounded {statusColors.bg} {statusColors.text}">
									{task.status}
								</span>
								<span class="text-[10px] px-2 py-0.5 rounded {priorityColors}">
									{task.priority}
								</span>
								{#if task.attempt > 1}
									<span class="text-[10px] px-2 py-0.5 rounded bg-warning-bg text-warning">
										Attempt {task.attempt}
									</span>
								{/if}
							</div>
							
							<h4 class="text-sm font-medium text-text mb-1 line-clamp-2">
								{task.title}
							</h4>
							
							{#if task.description}
								<p class="text-xs text-text-muted line-clamp-2 mb-2">
									{task.description}
								</p>
							{/if}
							
							<div class="flex items-center justify-between text-xs text-text-dim">
								{#if task.current_stage}
									<span>{STAGE_LABELS[task.current_stage] || task.current_stage}</span>
								{:else}
									<span>—</span>
								{/if}
								<span>{formatTimestamp(task.updated_at)}</span>
							</div>
						</div>
					{/each}
					
					{#if columnTasks.length === 0}
						<div class="text-center py-8 text-xs text-text-dim">
							No {column.label.toLowerCase()} tasks
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
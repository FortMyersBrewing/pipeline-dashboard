<script lang="ts">
	interface TaskFormData {
		title: string;
		description: string;
		priority: 'low' | 'medium' | 'high' | 'urgent';
	}

	let { tasks = $bindable() }: { tasks: TaskFormData[] } = $props();

	function addTask() {
		tasks = [...tasks, {
			title: '',
			description: '',
			priority: 'medium'
		}];
	}

	function removeTask(index: number) {
		if (tasks.length > 1) {
			tasks = tasks.filter((_, i) => i !== index);
		}
	}

	const priorityColors = {
		low: { bg: 'bg-gray-600/20', text: 'text-gray-400' },
		medium: { bg: 'bg-blue-600/20', text: 'text-blue-400' },
		high: { bg: 'bg-yellow-600/20', text: 'text-yellow-400' },
		urgent: { bg: 'bg-red-600/20', text: 'text-red-400' }
	};
</script>

<div class="space-y-6">
	<div>
		<h3 class="text-base font-semibold text-text mb-2">What to Build</h3>
		<p class="text-sm text-text-muted mb-4">
			Define the tasks you want the pipeline to work on. You can create multiple tasks in one launch.
		</p>
	</div>

	<div class="space-y-4">
		{#each tasks as task, index}
			<div class="border border-border rounded-lg p-4 space-y-4">
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium text-text">Task {index + 1}</span>
					{#if tasks.length > 1}
						<button 
							onclick={() => removeTask(index)}
							class="text-text-muted hover:text-red-400 transition-colors text-sm"
						>
							Remove
						</button>
					{/if}
				</div>

				<div>
					<label class="block text-xs font-medium text-text-muted mb-2">
						Title <span class="text-red-400">*</span>
					</label>
					<input 
						bind:value={task.title}
						placeholder="e.g., Implement user authentication"
						class="w-full px-3 py-2 border border-border bg-bg-card text-text text-sm rounded 
							focus:border-accent focus:outline-none"
					/>
				</div>

				<div>
					<label class="block text-xs font-medium text-text-muted mb-2">
						Description <span class="text-red-400">*</span>
					</label>
					<textarea 
						bind:value={task.description}
						placeholder="Describe what should be built, including any specific requirements..."
						rows="3"
						class="w-full px-3 py-2 border border-border bg-bg-card text-text text-sm rounded 
							focus:border-accent focus:outline-none resize-none"
					></textarea>
				</div>

				<div>
					<label class="block text-xs font-medium text-text-muted mb-2">Priority</label>
					<div class="flex gap-2">
						{#each ['low', 'medium', 'high', 'urgent'] as priority}
							{@const colors = priorityColors[priority as keyof typeof priorityColors]}
							<button 
								onclick={() => task.priority = priority as any}
								class="px-3 py-1 text-xs rounded border transition-colors
									{task.priority === priority 
										? `${colors.bg} ${colors.text} border-current` 
										: 'border-border text-text-muted hover:border-border-light'}"
							>
								{priority.charAt(0).toUpperCase() + priority.slice(1)}
							</button>
						{/each}
					</div>
				</div>
			</div>
		{/each}

		<button 
			onclick={addTask}
			class="w-full py-3 border-2 border-dashed border-border-light rounded-lg 
				text-sm text-text-muted hover:border-accent hover:text-accent transition-colors
				flex items-center justify-center gap-2"
		>
			+ Add Another Task
		</button>
	</div>

	<!-- Task Summary -->
	<div class="bg-bg-hover/50 border border-border rounded-lg p-4">
		<div class="flex items-center justify-between text-sm">
			<span class="text-text-muted">Tasks to create:</span>
			<span class="font-medium text-text">{tasks.length}</span>
		</div>
		<div class="flex items-center justify-between text-sm mt-1">
			<span class="text-text-muted">Estimated time:</span>
			<span class="font-medium text-text">{tasks.length * 15}-{tasks.length * 45} minutes</span>
		</div>
	</div>
</div>
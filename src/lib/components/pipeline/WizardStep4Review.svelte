<script lang="ts">
	import type { ProjectDoc } from '$lib/types';

	interface TaskFormData {
		title: string;
		description: string;
		priority: 'low' | 'medium' | 'high' | 'urgent';
	}

	interface LaunchConfig {
		maxAttempts: number;
		branchStrategy: 'main' | 'feature' | 'custom';
		customBranch?: string;
	}

	interface Props {
		tasks: TaskFormData[];
		selectedDocs: (ProjectDoc | undefined)[];
		selectedFiles: string[];
		config: LaunchConfig;
		tokenEstimate: number;
	}

	let { tasks, selectedDocs, selectedFiles, config, tokenEstimate }: Props = $props();

	const priorityColors = {
		low: { bg: 'bg-gray-600/20', text: 'text-gray-400' },
		medium: { bg: 'bg-blue-600/20', text: 'text-blue-400' },
		high: { bg: 'bg-yellow-600/20', text: 'text-yellow-400' },
		urgent: { bg: 'bg-red-600/20', text: 'text-red-400' }
	};

	const docTypeIcons = {
		spec: '📋',
		design: '🎨', 
		architecture: '🏗️',
		reference: '📎',
		notes: '📝'
	};

	function formatTokenEstimate(tokens: number): string {
		if (tokens < 1000) return `${tokens} tokens`;
		if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K tokens`;
		return `${(tokens / 1000000).toFixed(1)}M tokens`;
	}

	function estimateTime(taskCount: number): string {
		const minTime = taskCount * 15;
		const maxTime = taskCount * 45;
		
		if (maxTime < 60) {
			return `${minTime}-${maxTime} minutes`;
		} else {
			const minHours = Math.floor(minTime / 60);
			const maxHours = Math.floor(maxTime / 60);
			const minMinutes = minTime % 60;
			const maxMinutes = maxTime % 60;
			
			let result = '';
			if (minHours > 0) {
				result += `${minHours}h`;
				if (minMinutes > 0) result += ` ${minMinutes}m`;
			} else {
				result += `${minTime}m`;
			}
			
			result += ' - ';
			
			if (maxHours > 0) {
				result += `${maxHours}h`;
				if (maxMinutes > 0) result += ` ${maxMinutes}m`;
			} else {
				result += `${maxTime}m`;
			}
			
			return result;
		}
	}
</script>

<div class="space-y-6">
	<div>
		<h3 class="text-base font-semibold text-text mb-2">Review & Launch</h3>
		<p class="text-sm text-text-muted mb-4">
			Review your configuration before launching the pipeline tasks.
		</p>
	</div>

	<!-- Launch Summary -->
	<div class="bg-gradient-to-r from-accent/10 to-accent/5 border border-accent/30 rounded-lg p-6">
		<h4 class="text-lg font-semibold text-accent mb-4">🚀 Ready to Launch</h4>
		<div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
			<div>
				<div class="text-text-muted">Tasks</div>
				<div class="text-xl font-bold text-text">{tasks.length}</div>
			</div>
			<div>
				<div class="text-text-muted">Context Items</div>
				<div class="text-xl font-bold text-text">{selectedDocs.filter(Boolean).length + selectedFiles.length}</div>
			</div>
			<div>
				<div class="text-text-muted">Est. Tokens</div>
				<div class="text-xl font-bold text-text">{formatTokenEstimate(tokenEstimate)}</div>
			</div>
			<div>
				<div class="text-text-muted">Est. Time</div>
				<div class="text-xl font-bold text-text">{estimateTime(tasks.length)}</div>
			</div>
		</div>
	</div>

	<!-- Tasks to Create -->
	<div>
		<h4 class="text-sm font-semibold text-text mb-3">Tasks ({tasks.length})</h4>
		<div class="space-y-3">
			{#each tasks as task, index}
				{@const colors = priorityColors[task.priority]}
				<div class="border border-border rounded-lg p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="flex-1 min-w-0">
							<h5 class="font-medium text-text mb-1">{index + 1}. {task.title}</h5>
							<p class="text-sm text-text-muted mb-2 line-clamp-2">{task.description}</p>
						</div>
						<span class="text-xs px-2 py-1 rounded-full {colors.bg} {colors.text} whitespace-nowrap">
							{task.priority}
						</span>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Context Bundle -->
	{#if selectedDocs.filter(Boolean).length > 0 || selectedFiles.length > 0}
		<div>
			<h4 class="text-sm font-semibold text-text mb-3">
				Context Bundle ({selectedDocs.filter(Boolean).length + selectedFiles.length} items)
			</h4>
			
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<!-- Documents -->
				{#if selectedDocs.filter(Boolean).length > 0}
					<div class="border border-border rounded-lg p-4">
						<h5 class="text-xs font-medium text-text-muted mb-3">
							DOCUMENTS ({selectedDocs.filter(Boolean).length})
						</h5>
						<div class="space-y-2">
							{#each selectedDocs.filter(Boolean) as doc}
								{#if doc}
									<div class="flex items-center gap-2 text-sm">
										<span class="text-xs">{docTypeIcons[doc.doc_type]}</span>
										<span class="text-text truncate flex-1">{doc.title}</span>
										<span class="text-xs text-text-muted">v{doc.version}</span>
									</div>
								{/if}
							{/each}
						</div>
					</div>
				{/if}

				<!-- Files -->
				{#if selectedFiles.length > 0}
					<div class="border border-border rounded-lg p-4">
						<h5 class="text-xs font-medium text-text-muted mb-3">
							FILES ({selectedFiles.length})
						</h5>
						<div class="space-y-1 max-h-32 overflow-y-auto">
							{#each selectedFiles as file}
								<div class="text-sm text-text font-mono text-xs truncate">
									{file}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Configuration -->
	<div>
		<h4 class="text-sm font-semibold text-text mb-3">Configuration</h4>
		<div class="bg-bg-hover/50 border border-border rounded-lg p-4">
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
				<div>
					<div class="text-text-muted">Max Attempts</div>
					<div class="font-medium text-text">{config.maxAttempts}</div>
				</div>
				<div>
					<div class="text-text-muted">Branch Strategy</div>
					<div class="font-medium text-text">
						{config.branchStrategy === 'main' ? 'Main branch' : 
						 config.branchStrategy === 'feature' ? 'Feature branches' :
						 'Custom branch'}
					</div>
				</div>
				{#if config.branchStrategy === 'custom' && config.customBranch}
					<div>
						<div class="text-text-muted">Custom Branch</div>
						<div class="font-medium text-text font-mono text-xs">{config.customBranch}</div>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Warning/Info -->
	<div class="bg-yellow-600/10 border border-yellow-600/30 rounded-lg p-4">
		<div class="flex items-start gap-3">
			<div class="text-yellow-400 text-sm">⚠️</div>
			<div>
				<h4 class="text-sm font-medium text-yellow-400 mb-1">Before You Launch</h4>
				<ul class="text-xs text-yellow-300/80 space-y-1">
					<li>• Ensure your project has no uncommitted changes</li>
					<li>• The pipeline will create commits and potentially push to GitHub</li>
					<li>• Tasks will be executed by autonomous agents</li>
					<li>• You can monitor progress and intervene if needed</li>
				</ul>
			</div>
		</div>
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
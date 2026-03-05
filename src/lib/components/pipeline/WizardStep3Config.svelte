<script lang="ts">
	interface LaunchConfig {
		maxAttempts: number;
		branchStrategy: 'main' | 'feature' | 'custom';
		customBranch?: string;
	}

	let { config = $bindable() }: { config: LaunchConfig } = $props();

	const branchStrategies = [
		{
			value: 'main',
			label: 'Main Branch',
			description: 'Work directly on the main branch'
		},
		{
			value: 'feature',
			label: 'Feature Branch',
			description: 'Create feature/{task-slug} branches for each task'
		},
		{
			value: 'custom',
			label: 'Custom Branch',
			description: 'Specify a custom branch name'
		}
	];

	function updateBranchStrategy(strategy: 'main' | 'feature' | 'custom') {
		config.branchStrategy = strategy;
		if (strategy !== 'custom') {
			config.customBranch = undefined;
		}
	}
</script>

<div class="space-y-6">
	<div>
		<h3 class="text-base font-semibold text-text mb-2">Configuration</h3>
		<p class="text-sm text-text-muted mb-4">
			Configure how the pipeline tasks should be executed.
		</p>
	</div>

	<!-- Max Attempts -->
	<div>
		<label class="block text-sm font-medium text-text mb-3">
			Maximum Attempts
		</label>
		<div class="space-y-2">
			<input 
				type="range" 
				bind:value={config.maxAttempts}
				min="1" 
				max="5" 
				step="1"
				class="w-full h-2 bg-bg-hover rounded-lg appearance-none cursor-pointer slider"
			/>
			<div class="flex justify-between text-xs text-text-muted">
				<span>1</span>
				<span class="font-medium text-text">
					{config.maxAttempts} attempt{config.maxAttempts !== 1 ? 's' : ''}
				</span>
				<span>5</span>
			</div>
			<p class="text-xs text-text-muted">
				How many times should the pipeline retry if a stage fails?
			</p>
		</div>
	</div>

	<!-- Branch Strategy -->
	<div>
		<label class="block text-sm font-medium text-text mb-3">
			Branch Strategy
		</label>
		<div class="space-y-3">
			{#each branchStrategies as strategy}
				<label class="flex items-start gap-3 p-4 border border-border rounded-lg 
					hover:border-border-light cursor-pointer transition-colors
					{config.branchStrategy === strategy.value ? 'border-accent bg-accent/5' : ''}">
					<input 
						type="radio" 
						name="branchStrategy"
						value={strategy.value}
						checked={config.branchStrategy === strategy.value}
						onchange={() => updateBranchStrategy(strategy.value as any)}
						class="w-4 h-4 text-accent bg-bg-card border-border focus:ring-accent mt-0.5"
					/>
					<div class="flex-1 min-w-0">
						<div class="text-sm font-medium text-text">{strategy.label}</div>
						<div class="text-xs text-text-muted mt-1">{strategy.description}</div>
					</div>
				</label>
			{/each}
		</div>

		<!-- Custom Branch Input -->
		{#if config.branchStrategy === 'custom'}
			<div class="mt-3 ml-7">
				<label class="block text-xs font-medium text-text-muted mb-2">
					Custom Branch Name
				</label>
				<input 
					bind:value={config.customBranch}
					placeholder="e.g., feature/new-feature"
					class="w-full px-3 py-2 border border-border bg-bg-card text-text text-sm rounded 
						focus:border-accent focus:outline-none"
				/>
				<p class="text-xs text-text-muted mt-1">
					The agent will create and work on this branch
				</p>
			</div>
		{/if}
	</div>

	<!-- Configuration Summary -->
	<div class="bg-bg-hover/50 border border-border rounded-lg p-4">
		<h4 class="text-sm font-medium text-text mb-3">Configuration Summary</h4>
		<div class="space-y-2 text-sm">
			<div class="flex items-center justify-between">
				<span class="text-text-muted">Max attempts:</span>
				<span class="font-medium text-text">{config.maxAttempts}</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-text-muted">Branch strategy:</span>
				<span class="font-medium text-text">
					{config.branchStrategy === 'main' ? 'Main branch' : 
					 config.branchStrategy === 'feature' ? 'Feature branches' :
					 config.customBranch || 'Custom'}
				</span>
			</div>
			{#if config.branchStrategy === 'custom' && config.customBranch}
				<div class="flex items-center justify-between">
					<span class="text-text-muted">Custom branch:</span>
					<span class="font-medium text-text font-mono text-xs">{config.customBranch}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Tips -->
	<div class="bg-blue-600/10 border border-blue-600/30 rounded-lg p-4">
		<h4 class="text-sm font-medium text-blue-400 mb-2">💡 Tips</h4>
		<ul class="text-xs text-blue-300/80 space-y-1">
			<li>• Feature branches help keep work isolated and make reviews easier</li>
			<li>• Higher max attempts increase resilience but consume more resources</li>
			<li>• Custom branches are useful for ongoing feature development</li>
		</ul>
	</div>
</div>

<style>
	.slider::-webkit-slider-thumb {
		appearance: none;
		height: 20px;
		width: 20px;
		border-radius: 50%;
		background: rgb(var(--color-accent));
		cursor: pointer;
		border: 2px solid rgb(var(--color-bg-card));
	}

	.slider::-moz-range-thumb {
		height: 20px;
		width: 20px;
		border-radius: 50%;
		background: rgb(var(--color-accent));
		cursor: pointer;
		border: 2px solid rgb(var(--color-bg-card));
	}
</style>
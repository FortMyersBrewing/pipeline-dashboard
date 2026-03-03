<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let refreshInterval: ReturnType<typeof setInterval>;
	onMount(() => { refreshInterval = setInterval(() => invalidateAll(), 5000); });
	onDestroy(() => clearInterval(refreshInterval));

	// Helper function to convert hex color to Tailwind border classes
	function getColorStyles(color: string) {
		// Remove # if present
		const hex = color.replace('#', '');
		return {
			borderColor: `${color}50`, // Add opacity to hex color for border
			accentColor: color
		};
	}

	// Status color mapping
	const statusColors = {
		idle: 'text-text-dim',
		working: 'text-info',
		offline: 'text-error'
	};

	const statusDotColors = {
		idle: 'bg-text-dim',
		working: 'bg-info animate-pulse',
		offline: 'bg-error'
	};
</script>

<div class="p-6">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-lg font-semibold text-text">Agents</h1>
			<p class="text-xs text-text-muted mt-0.5">OpenClaw agent roster and status</p>
		</div>
		<div class="flex items-center gap-2">
			<span class="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
			<span class="text-[10px] text-text-dim">Live status</span>
		</div>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
		{#each data.agents as agent}
			{@const colorStyles = getColorStyles(agent.color)}
			<div 
				class="bg-bg-card border rounded-lg p-5 transition-all hover:border-opacity-70 {agent.status === 'working' ? 'ring-1 ring-info/20' : ''}"
				style="border-color: {colorStyles.borderColor};"
			>
				<div class="flex items-center justify-between mb-3">
					<div class="flex items-center gap-3">
						<span class="text-2xl">{agent.icon}</span>
						<div>
							<h3 class="text-sm font-semibold text-text">{agent.id}</h3>
							<p class="text-xs font-medium" style="color: {colorStyles.accentColor};">{agent.name}</p>
						</div>
					</div>
					<span class="flex items-center gap-1.5 text-xs {statusColors[agent.status]}">
						<span class="w-2 h-2 rounded-full {statusDotColors[agent.status]}"></span>
						{agent.status}
					</span>
				</div>

				<p class="text-xs text-text-muted mb-3">{agent.role}</p>

				<div class="flex items-center justify-between text-xs mb-4">
					<span class="text-text-dim">Model:</span>
					<span class="text-text font-mono">{agent.modelAbbrev}</span>
				</div>

				<div class="bg-bg rounded-md p-3 border border-border">
					<p class="text-[10px] text-text-dim">Last Activity</p>
					<p class="text-xs text-text-muted mt-1">{agent.lastActivity}</p>
				</div>
			</div>
		{/each}
	</div>
</div>

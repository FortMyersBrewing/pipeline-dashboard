<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let refreshInterval: ReturnType<typeof setInterval>;
	onMount(() => { refreshInterval = setInterval(() => invalidateAll(), 5000); });
	onDestroy(() => clearInterval(refreshInterval));

	const agentColorMap: Record<string, string> = {
		scout: 'border-scout/30 hover:border-scout/50',
		builder: 'border-builder/30 hover:border-builder/50',
		gatekeeper: 'border-gatekeeper/30 hover:border-gatekeeper/50',
		reviewer: 'border-reviewer/30 hover:border-reviewer/50',
		qa: 'border-qa/30 hover:border-qa/50',
	};

	const agentTextColor: Record<string, string> = {
		scout: 'text-scout',
		builder: 'text-builder',
		gatekeeper: 'text-gatekeeper',
		reviewer: 'text-reviewer',
		qa: 'text-qa',
	};
</script>

<div class="p-6">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-lg font-semibold text-text">Agents</h1>
			<p class="text-xs text-text-muted mt-0.5">Pipeline agent roster and status</p>
		</div>
		<div class="flex items-center gap-2">
			<span class="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
			<span class="text-[10px] text-text-dim">Live status</span>
		</div>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
		{#each data.agents as agent}
			<div class="bg-bg-card border rounded-lg p-5 transition-all {agentColorMap[agent.id] || 'border-border hover:border-border-light'} {agent.status === 'working' ? 'ring-1 ring-info/20' : ''}">
				<div class="flex items-center justify-between mb-3">
					<div class="flex items-center gap-3">
						<span class="text-2xl">{agent.icon}</span>
						<div>
							<h3 class="text-sm font-semibold {agentTextColor[agent.id] || 'text-text'}">{agent.name}</h3>
							<p class="text-[10px] text-text-dim">{agent.model}</p>
						</div>
					</div>
					<span class="flex items-center gap-1.5 text-xs {agent.status === 'working' ? 'text-info' : agent.status === 'active' ? 'text-success' : 'text-text-dim'}">
						<span class="w-2 h-2 rounded-full {agent.status === 'working' ? 'bg-info animate-pulse' : agent.status === 'active' ? 'bg-success' : 'bg-text-dim'}"></span>
						{agent.status}
					</span>
				</div>

				<p class="text-xs text-text-muted mb-4">{agent.role}</p>

				{#if agent.current_work}
					<div class="bg-bg rounded-md p-3 mb-3 border border-border">
						<p class="text-[10px] text-info">Working on:</p>
						<p class="text-xs text-text mt-1">{agent.current_work.task_title}</p>
					</div>
				{/if}

				<div class="flex items-center gap-4 text-xs text-text-dim">
					<span>{agent.total_runs} runs</span>
					<span>{agent.passed} passed</span>
					{#if agent.total_runs > 0}
						<span class="{agent.pass_rate >= 80 ? 'text-success' : agent.pass_rate >= 50 ? 'text-warning' : 'text-error'}">{agent.pass_rate}%</span>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

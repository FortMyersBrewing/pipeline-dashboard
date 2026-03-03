<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<div class="p-8">
	<div class="mb-8">
		<h1 class="text-xl font-semibold text-text">Agents</h1>
		<p class="text-sm text-text-muted mt-1">Pipeline agent roster</p>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
		{#each data.agents as agent}
			<div class="border border-border rounded-lg p-5 hover:border-border-light transition-all {agent.status === 'working' ? 'border-[#8B5CF6]/30 bg-[rgba(139,92,246,0.03)]' : ''}">
				<div class="flex items-center justify-between mb-3">
					<div class="flex items-center gap-3">
						<span class="text-2xl">{agent.icon}</span>
						<div>
							<h3 class="text-sm font-semibold text-text">{agent.name}</h3>
							<p class="text-xs text-text-dim">{agent.model}</p>
						</div>
					</div>
					<span class="flex items-center gap-1.5 text-xs {agent.status === 'working' ? 'text-[#8B5CF6]' : agent.status === 'active' ? 'text-[#22C55E]' : 'text-[#52525B]'}">
						<span class="w-2 h-2 rounded-full {agent.status === 'working' ? 'bg-[#8B5CF6] animate-pulse' : agent.status === 'active' ? 'bg-[#22C55E]' : 'bg-[#52525B]'}"></span>
						{agent.status}
					</span>
				</div>

				<p class="text-xs text-text-muted mb-4">{agent.role}</p>

				{#if agent.current_work}
					<div class="bg-bg rounded-md p-3 mb-3 border border-border">
						<p class="text-xs text-[#8B5CF6]">Working on:</p>
						<p class="text-xs text-text mt-1">{agent.current_work.task_title}</p>
					</div>
				{/if}

				<div class="flex items-center gap-4 text-xs text-text-dim">
					<span>{agent.total_runs} runs</span>
					<span>{agent.passed} passed</span>
					{#if agent.total_runs > 0}
						<span class="{agent.pass_rate >= 80 ? 'text-[#22C55E]' : agent.pass_rate >= 50 ? 'text-[#EAB308]' : 'text-[#EF4444]'}">{agent.pass_rate}% pass rate</span>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

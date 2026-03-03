<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function timeAgo(date: string): string {
		const ms = Date.now() - new Date(date).getTime();
		const min = Math.floor(ms / 60000);
		if (min < 1) return 'just now';
		if (min < 60) return `${min}m ago`;
		const hr = Math.floor(min / 60);
		if (hr < 24) return `${hr}h ago`;
		return `${Math.floor(hr / 24)}d ago`;
	}

	function typeIcon(type: string): string {
		const icons: Record<string, string> = {
			stage_start: '▶',
			stage_pass: '✓',
			stage_fail: '✗',
			retry: '↻',
			escalation: '🚨',
			merge: '⊕',
			note: '●',
		};
		return icons[type] || '●';
	}

	function typeColor(type: string): string {
		if (type === 'stage_pass' || type === 'merge') return 'text-[#22C55E]';
		if (type === 'stage_fail' || type === 'escalation') return 'text-[#EF4444]';
		if (type === 'retry') return 'text-[#EAB308]';
		if (type === 'stage_start') return 'text-[#8B5CF6]';
		return 'text-[#71717A]';
	}
</script>

<div class="p-8">
	<div class="mb-8">
		<h1 class="text-xl font-semibold text-text">Activity</h1>
		<p class="text-sm text-text-muted mt-1">Pipeline event log</p>
	</div>

	<div class="space-y-1">
		{#each data.events as event}
			<div class="flex items-start gap-4 px-4 py-3 rounded-lg hover:bg-bg-card transition-colors">
				<span class={`text-sm mt-0.5 ${typeColor(event.type)}`}>{typeIcon(event.type)}</span>
				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-2">
						<span class="text-sm text-text">{event.message}</span>
					</div>
					<div class="flex items-center gap-3 mt-1">
						{#if event.task_title}
							<span class="text-xs text-text-dim font-mono">{event.task_id}</span>
							<span class="text-xs text-text-muted">{event.task_title}</span>
						{/if}
						{#if event.agent}
							<span class="text-xs text-text-dim">· {event.agent}</span>
						{/if}
					</div>
				</div>
				<span class="text-xs text-text-dim shrink-0">{timeAgo(event.created_at)}</span>
			</div>
		{/each}
	</div>
</div>

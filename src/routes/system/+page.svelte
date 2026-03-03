<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	let systemData: {
		uptime: number;
		node_version: string;
		platform: string;
		memory: { rss_mb: number; heap_used_mb: number; heap_total_mb: number };
		services: { name: string; status: string; description: string; details?: string; uptime?: number }[];
		db_stats: { tasks: number; events: number; runs: number; active_runs: number };
	} | null = $state(null);
	let loading = $state(true);
	let error = $state('');

	async function fetchSystem() {
		try {
			const res = await fetch('/api/system');
			systemData = await res.json();
		} catch { error = 'Failed to load system status'; }
		finally { loading = false; }
	}

	function formatUptime(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = seconds % 60;
		if (h > 0) return `${h}h ${m}m ${s}s`;
		if (m > 0) return `${m}m ${s}s`;
		return `${s}s`;
	}

	function statusColor(status: string): string {
		if (status === 'operational') return 'text-success';
		if (status === 'active') return 'text-info';
		if (status === 'degraded') return 'text-warning';
		if (status === 'down') return 'text-error';
		return 'text-text-dim';
	}

	function statusDot(status: string): string {
		if (status === 'operational') return 'bg-success';
		if (status === 'active') return 'bg-info animate-pulse';
		if (status === 'degraded') return 'bg-warning';
		if (status === 'down') return 'bg-error';
		return 'bg-text-dim';
	}

	let refreshInterval: ReturnType<typeof setInterval>;
	onMount(() => {
		fetchSystem();
		refreshInterval = setInterval(fetchSystem, 10000);
	});
	onDestroy(() => clearInterval(refreshInterval));
</script>

<div class="p-6">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-lg font-semibold text-text">System</h1>
			<p class="text-xs text-text-muted mt-0.5">OpenClaw service health and status</p>
		</div>
		{#if systemData}
			<div class="flex items-center gap-2 text-xs text-text-dim">
				<span class="w-2 h-2 rounded-full bg-success"></span>
				Uptime: {formatUptime(systemData.uptime)}
			</div>
		{/if}
	</div>

	{#if error}
		<div class="bg-error/10 border border-error/30 rounded-lg p-4 text-xs text-error">{error}</div>
	{:else if loading}
		<div class="text-xs text-text-dim">Loading...</div>
	{:else if systemData}
		<!-- Services -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
			{#each systemData.services as service}
				<div class="bg-bg-card border border-border rounded-lg p-4">
					<div class="flex items-center justify-between mb-2">
						<h3 class="text-sm font-semibold text-text">{service.name}</h3>
						<div class="flex items-center gap-1.5">
							<span class="w-2 h-2 rounded-full {statusDot(service.status)}"></span>
							<span class="text-xs {statusColor(service.status)}">{service.status}</span>
						</div>
					</div>
					<p class="text-xs text-text-muted mb-2">{service.description}</p>
					{#if service.details}
						<p class="text-[10px] text-text-dim font-mono">{service.details}</p>
					{/if}
					{#if service.uptime}
						<p class="text-[10px] text-text-dim mt-1">Uptime: {formatUptime(service.uptime)}</p>
					{/if}
				</div>
			{/each}
		</div>

		<!-- System info -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
			<!-- Runtime -->
			<div class="bg-bg-card border border-border rounded-lg p-4">
				<h3 class="text-xs font-semibold text-text-dim uppercase tracking-wider mb-3">Runtime</h3>
				<div class="space-y-2 text-xs">
					<div class="flex justify-between">
						<span class="text-text-muted">Node.js</span>
						<span class="text-text font-mono">{systemData.node_version}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-muted">Platform</span>
						<span class="text-text font-mono">{systemData.platform}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-muted">RSS Memory</span>
						<span class="text-text font-mono">{systemData.memory.rss_mb} MB</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-muted">Heap Used</span>
						<span class="text-text font-mono">{systemData.memory.heap_used_mb} / {systemData.memory.heap_total_mb} MB</span>
					</div>
				</div>
			</div>

			<!-- Database -->
			<div class="bg-bg-card border border-border rounded-lg p-4">
				<h3 class="text-xs font-semibold text-text-dim uppercase tracking-wider mb-3">Database</h3>
				<div class="space-y-2 text-xs">
					<div class="flex justify-between">
						<span class="text-text-muted">Tasks</span>
						<span class="text-text font-mono">{systemData.db_stats.tasks}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-muted">Events</span>
						<span class="text-text font-mono">{systemData.db_stats.events}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-muted">Runs</span>
						<span class="text-text font-mono">{systemData.db_stats.runs}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-text-muted">Active Runs</span>
						<span class="text-text font-mono {systemData.db_stats.active_runs > 0 ? 'text-info' : ''}">{systemData.db_stats.active_runs}</span>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

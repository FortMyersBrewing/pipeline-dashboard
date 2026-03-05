<script lang="ts">
	interface CIRun {
		name: string;
		status: string;
		conclusion: string | null;
		display_status: 'running' | 'success' | 'failure' | 'pending' | 'cancelled' | 'skipped';
		created_at: string;
		url: string;
		time_ago: string;
	}

	interface CIData {
		ci_configured: boolean;
		overall_status: 'passing' | 'failing' | 'running' | 'none';
		latest_run: CIRun | null;
		runs: CIRun[];
	}

	interface Props {
		projectId: string;
		size?: 'sm' | 'md' | 'lg';
		showLabel?: boolean;
	}

	let { projectId, size = 'md', showLabel = false }: Props = $props();

	let ciData = $state<CIData | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let expanded = $state(false);

	// Fetch CI data
	async function fetchCIData() {
		loading = true;
		error = null;
		
		try {
			const response = await fetch(`/api/projects/${projectId}/ci`);
			if (response.ok) {
				ciData = await response.json();
			} else {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				error = errorData.error || 'Failed to fetch CI data';
			}
		} catch (err) {
			error = 'Failed to fetch CI data';
			console.error('CI fetch error:', err);
		} finally {
			loading = false;
		}
	}

	// Fetch on mount
	$effect(() => {
		fetchCIData();
	});

	// Size classes
	const sizeClasses = {
		sm: 'w-3 h-3 text-[10px]',
		md: 'w-4 h-4 text-xs',
		lg: 'w-5 h-5 text-sm'
	};

	// Status styling
	function getStatusStyle(status: string) {
		switch (status) {
			case 'passing':
				return { bg: 'bg-success', text: 'text-white', icon: '✓' };
			case 'failing':
				return { bg: 'bg-error', text: 'text-white', icon: '✗' };
			case 'running':
				return { bg: 'bg-warning', text: 'text-white', icon: '⟳' };
			default:
				return { bg: 'bg-text-dim', text: 'text-white', icon: '◯' };
		}
	}

	function getStatusLabel(status: string) {
		switch (status) {
			case 'passing': return 'Passing';
			case 'failing': return 'Failing';
			case 'running': return 'Running';
			case 'none': return 'No CI';
			default: return 'Unknown';
		}
	}

	function openRun(url: string) {
		window.open(url, '_blank');
	}

	const statusStyle = $derived(() => {
		if (!ciData) return getStatusStyle('none');
		return getStatusStyle(ciData.overall_status);
	});
</script>

{#if loading}
	<div class="flex items-center gap-1">
		<div class="{sizeClasses[size]} bg-border rounded-full animate-pulse"></div>
		{#if showLabel}<span class="text-xs text-text-dim">Loading...</span>{/if}
	</div>
{:else if error}
	<div class="flex items-center gap-1" title={error}>
		<div class="{sizeClasses[size]} bg-error/20 text-error rounded-full flex items-center justify-center">!</div>
		{#if showLabel}<span class="text-xs text-error">CI Error</span>{/if}
	</div>
{:else if ciData}
	<div class="relative">
		<button 
			onclick={() => expanded = !expanded}
			class="flex items-center gap-1 hover:opacity-80 transition-opacity"
			title={`CI Status: ${getStatusLabel(ciData.overall_status)}${ciData.latest_run ? ` - ${ciData.latest_run.name}` : ''}`}
		>
			<div class="{sizeClasses[size]} {statusStyle().bg} {statusStyle().text} rounded-full flex items-center justify-center font-bold {ciData.overall_status === 'running' ? 'animate-spin' : ''}">
				{statusStyle().icon}
			</div>
			{#if showLabel}
				<span class="text-xs {ciData.overall_status === 'failing' ? 'text-error' : ciData.overall_status === 'passing' ? 'text-success' : 'text-text-muted'}">
					{getStatusLabel(ciData.overall_status)}
				</span>
			{/if}
		</button>

		{#if expanded && ciData.runs.length > 0}
			<div class="absolute top-full left-0 mt-1 bg-bg-card border border-border rounded-lg shadow-xl z-50 min-w-[280px]">
				<div class="p-3 border-b border-border">
					<h3 class="text-sm font-semibold text-text">Recent CI Runs</h3>
				</div>
				<div class="max-h-64 overflow-y-auto">
					{#each ciData.runs as run}
						<button 
							onclick={() => openRun(run.url)}
							class="w-full p-3 hover:bg-bg-hover transition-colors border-b border-border/50 last:border-0 text-left"
						>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2 min-w-0">
									<div class="w-2 h-2 rounded-full {run.display_status === 'success' ? 'bg-success' : run.display_status === 'failure' ? 'bg-error' : run.display_status === 'running' ? 'bg-warning' : 'bg-text-dim'}"></div>
									<span class="text-sm text-text truncate">{run.name}</span>
								</div>
								<span class="text-xs text-text-muted">{run.time_ago}</span>
							</div>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}

<!-- Click outside to close -->
{#if expanded}
	<div class="fixed inset-0 z-40" onclick={() => expanded = false}></div>
{/if}
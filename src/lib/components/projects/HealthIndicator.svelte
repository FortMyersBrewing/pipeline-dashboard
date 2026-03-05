<script lang="ts">
	interface HealthData {
		project_id: string;
		last_commit_date: string | null;
		days_since_commit: number | null;
		freshness: 'fresh' | 'aging' | 'stale';
		open_tasks: number;
		failed_tasks: number;
		completed_tasks: number;
		total_tasks: number;
		ci_status: 'passing' | 'failing' | 'running' | 'none';
		health_score: 'healthy' | 'warning' | 'critical';
		activity_level: 'active' | 'idle' | 'stale';
		indicators: {
			has_recent_commits: boolean;
			has_failed_tasks: boolean;
			has_ci: boolean;
			is_active: boolean;
		};
	}

	interface Props {
		projectId: string;
		size?: 'sm' | 'md' | 'lg';
		showTooltip?: boolean;
	}

	let { projectId, size = 'md', showTooltip = true }: Props = $props();

	let healthData = $state<HealthData | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// Fetch health data
	async function fetchHealthData() {
		loading = true;
		error = null;
		
		try {
			const response = await fetch(`/api/projects/${projectId}/health`);
			if (response.ok) {
				healthData = await response.json();
			} else {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				error = errorData.error || 'Failed to fetch health data';
			}
		} catch (err) {
			error = 'Failed to fetch health data';
			console.error('Health fetch error:', err);
		} finally {
			loading = false;
		}
	}

	// Fetch on mount
	$effect(() => {
		fetchHealthData();
	});

	// Size classes
	const sizeClasses = {
		sm: 'w-2 h-2',
		md: 'w-3 h-3',
		lg: 'w-4 h-4'
	};

	// Health styling
	function getHealthStyle(healthScore: string, activityLevel: string) {
		if (healthScore === 'critical') {
			return { 
				bg: 'bg-error', 
				pulse: '',
				tooltip: 'Critical: Needs attention'
			};
		}
		
		if (healthScore === 'warning') {
			return { 
				bg: 'bg-warning', 
				pulse: '',
				tooltip: 'Warning: Some issues detected'
			};
		}
		
		if (activityLevel === 'active') {
			return { 
				bg: 'bg-success', 
				pulse: 'animate-pulse',
				tooltip: 'Healthy & Active'
			};
		}
		
		if (activityLevel === 'idle') {
			return { 
				bg: 'bg-success', 
				pulse: '',
				tooltip: 'Healthy & Idle'
			};
		}
		
		return { 
			bg: 'bg-text-dim', 
			pulse: '',
			tooltip: 'Stale: No recent activity'
		};
	}

	function buildTooltipText() {
		if (!healthData) return '';
		
		const parts = [];
		
		// Health summary
		parts.push(`Health: ${healthData.health_score}`);
		parts.push(`Activity: ${healthData.activity_level}`);
		
		// Details
		if (healthData.days_since_commit !== null) {
			parts.push(`Last commit: ${healthData.days_since_commit}d ago (${healthData.freshness})`);
		} else {
			parts.push('No commit history');
		}
		
		if (healthData.total_tasks > 0) {
			parts.push(`Tasks: ${healthData.open_tasks} open, ${healthData.failed_tasks} failed`);
		} else {
			parts.push('No tasks');
		}
		
		if (healthData.ci_status !== 'none') {
			parts.push(`CI: ${healthData.ci_status}`);
		}
		
		return parts.join('\n');
	}

	const healthStyle = $derived(() => {
		if (!healthData) return getHealthStyle('healthy', 'idle');
		return getHealthStyle(healthData.health_score, healthData.activity_level);
	});

	const tooltipText = $derived(() => buildTooltipText());
</script>

{#if loading}
	<div class="{sizeClasses[size]} bg-border rounded-full animate-pulse"></div>
{:else if error}
	<div 
		class="{sizeClasses[size]} bg-error/30 rounded-full" 
		title={showTooltip ? `Health check failed: ${error}` : undefined}
	></div>
{:else if healthData}
	<div 
		class="{sizeClasses[size]} {healthStyle().bg} {healthStyle().pulse} rounded-full" 
		title={showTooltip ? tooltipText() : undefined}
	></div>
{/if}
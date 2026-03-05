<script lang="ts">
	interface Commit {
		sha: string;
		message: string;
		author: string;
		author_email: string;
		date: string;
		github_url: string | null;
	}

	interface PR {
		number: number;
		title: string;
		state: string;
		display_state: string;
		author: string;
		author_avatar: string | null;
		created_at: string;
		url: string;
		time_ago: string;
	}

	interface Props {
		projectId: string;
	}

	let { projectId }: Props = $props();

	let commits = $state<Commit[]>([]);
	let prs = $state<PR[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let activeView = $state<'commits' | 'prs'>('commits');

	// Fetch git history data
	async function fetchGitHistory() {
		loading = true;
		error = null;
		
		try {
			const [commitsRes, prsRes] = await Promise.all([
				fetch(`/api/projects/${projectId}/commits`),
				fetch(`/api/projects/${projectId}/prs`)
			]);
			
			if (commitsRes.ok) {
				const commitsData = await commitsRes.json();
				commits = commitsData.commits || [];
			}
			
			if (prsRes.ok) {
				const prsData = await prsRes.json();
				prs = prsData.prs || [];
			}
			
			if (!commitsRes.ok && !prsRes.ok) {
				error = 'Failed to load git history';
			}
		} catch (err) {
			error = 'Failed to load git history';
			console.error('Git history fetch error:', err);
		} finally {
			loading = false;
		}
	}

	// Fetch on mount
	$effect(() => {
		fetchGitHistory();
	});

	// Format date
	function formatDate(dateStr: string): string {
		try {
			const date = new Date(dateStr);
			return date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
			});
		} catch {
			return dateStr;
		}
	}

	// Get PR state styling
	function getPRStateStyle(state: string) {
		switch (state) {
			case 'merged':
				return 'bg-purple-600/20 text-purple-400 border-purple-600/30';
			case 'open':
				return 'bg-green-600/20 text-green-400 border-green-600/30';
			case 'closed':
				return 'bg-red-600/20 text-red-400 border-red-600/30';
			default:
				return 'bg-gray-600/20 text-gray-400 border-gray-600/30';
		}
	}

	function openLink(url: string) {
		window.open(url, '_blank');
	}
</script>

<div class="space-y-4">
	<!-- View Toggle -->
	<div class="flex gap-1 border-b border-border">
		<button 
			onclick={() => activeView = 'commits'}
			class="px-4 py-2 text-sm transition-colors {activeView === 'commits' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text'}"
		>
			Commits ({commits.length})
		</button>
		<button 
			onclick={() => activeView = 'prs'}
			class="px-4 py-2 text-sm transition-colors {activeView === 'prs' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text'}"
		>
			Pull Requests ({prs.length})
		</button>
	</div>

	{#if loading}
		<div class="space-y-3">
			{#each Array(5) as _}
				<div class="p-4 bg-bg-card border border-border rounded animate-pulse">
					<div class="h-4 bg-border/50 rounded mb-2"></div>
					<div class="h-3 bg-border/30 rounded w-3/4"></div>
				</div>
			{/each}
		</div>
	{:else if error}
		<div class="p-4 bg-error/10 border border-error/30 rounded text-error text-sm">
			{error}
		</div>
	{:else}
		{#if activeView === 'commits'}
			<div class="space-y-3">
				{#if commits.length === 0}
					<div class="text-center py-8">
						<p class="text-sm text-text-muted">No commits found</p>
						<p class="text-xs text-text-dim">Repository may be empty or path not accessible</p>
					</div>
				{:else}
					{#each commits as commit}
						<div class="p-4 bg-bg-card border border-border rounded hover:border-border-light transition-colors">
							<div class="flex items-start justify-between">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2 mb-1">
										{#if commit.github_url}
											<button 
												onclick={() => openLink(commit.github_url!)}
												class="text-xs font-mono text-accent hover:underline"
											>
												{commit.sha}
											</button>
										{:else}
											<span class="text-xs font-mono text-text-muted">{commit.sha}</span>
										{/if}
										<span class="text-xs text-text-muted">by {commit.author}</span>
									</div>
									<p class="text-sm text-text line-clamp-2">{commit.message}</p>
								</div>
								<span class="text-xs text-text-dim ml-4 flex-shrink-0">{formatDate(commit.date)}</span>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		{:else}
			<div class="space-y-3">
				{#if prs.length === 0}
					<div class="text-center py-8">
						<p class="text-sm text-text-muted">No pull requests found</p>
						<p class="text-xs text-text-dim">Repository may not have any PRs or GitHub access not available</p>
					</div>
				{:else}
					{#each prs as pr}
						<div class="p-4 bg-bg-card border border-border rounded hover:border-border-light transition-colors">
							<div class="flex items-start justify-between">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2 mb-2">
										<button 
											onclick={() => openLink(pr.url)}
											class="text-sm text-accent hover:underline font-medium"
										>
											#{pr.number} {pr.title}
										</button>
										<span class="text-[10px] px-2 py-0.5 rounded-full border {getPRStateStyle(pr.display_state)}">
											{pr.display_state}
										</span>
									</div>
									<div class="flex items-center gap-2 text-xs text-text-muted">
										<span>by {pr.author}</span>
										<span>•</span>
										<span>{pr.time_ago}</span>
									</div>
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>
		{/if}
	{/if}
</div>
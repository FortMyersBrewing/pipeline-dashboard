<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	interface Issue {
		number: number;
		title: string;
		body: string;
		labels: Array<{ name: string; color: string }>;
		state: string;
		url: string;
		suggested_priority: string;
	}

	interface Props {
		projectId: string;
		visible: boolean;
	}

	let { projectId, visible }: Props = $props();

	const dispatch = createEventDispatcher();

	let issues = $state<Issue[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let selectedIssues = $state<Set<number>>(new Set());
	let importing = $state(false);

	// Issue priority overrides
	let issuePriorities = $state<Record<number, string>>({});

	// Fetch issues when modal opens
	$effect(() => {
		if (visible && issues.length === 0) {
			fetchIssues();
		}
	});

	async function fetchIssues() {
		loading = true;
		error = null;
		
		try {
			const response = await fetch(`/api/projects/${projectId}/github-issues`);
			if (response.ok) {
				const data = await response.json();
				issues = data.issues || [];
				
				// Initialize priorities with suggestions
				for (const issue of issues) {
					issuePriorities[issue.number] = issue.suggested_priority;
				}
			} else {
				const errorData = await response.json();
				error = errorData.error || 'Failed to fetch GitHub issues';
			}
		} catch (err) {
			error = 'Failed to fetch GitHub issues';
			console.error('Issue fetch error:', err);
		} finally {
			loading = false;
		}
	}

	async function importSelected() {
		if (selectedIssues.size === 0) return;
		
		importing = true;
		try {
			const selectedIssueData = Array.from(selectedIssues).map(issueNumber => {
				const issue = issues.find(i => i.number === issueNumber)!;
				return {
					number: issue.number,
					title: issue.title,
					body: issue.body,
					url: issue.url,
					priority: issuePriorities[issue.number] || 'medium'
				};
			});
			
			const response = await fetch(`/api/projects/${projectId}/github-issues`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					selected_issues: selectedIssueData
				})
			});
			
			if (response.ok) {
				const result = await response.json();
				dispatch('imported', {
					count: result.imported_count,
					tasks: result.created_tasks
				});
				close();
			} else {
				const errorData = await response.json();
				alert(errorData.error || 'Failed to import issues');
			}
		} catch (err) {
			alert('Failed to import issues');
		} finally {
			importing = false;
		}
	}

	function close() {
		dispatch('close');
	}

	function toggleIssue(issueNumber: number) {
		if (selectedIssues.has(issueNumber)) {
			selectedIssues.delete(issueNumber);
		} else {
			selectedIssues.add(issueNumber);
		}
		selectedIssues = selectedIssues; // Trigger reactivity
	}

	function toggleAll() {
		if (selectedIssues.size === issues.length) {
			selectedIssues.clear();
		} else {
			selectedIssues = new Set(issues.map(i => i.number));
		}
		selectedIssues = selectedIssues; // Trigger reactivity
	}

	function getLabelColor(color: string): string {
		// Ensure color is valid hex
		const validColor = color.startsWith('#') ? color : `#${color}`;
		return `background-color: ${validColor}; color: white;`;
	}

	function getPriorityColor(priority: string): string {
		const colors = {
			urgent: 'bg-red-600/20 text-red-400 border-red-600/30',
			high: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
			medium: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
			low: 'bg-green-600/20 text-green-400 border-green-600/30'
		};
		return colors[priority as keyof typeof colors] || colors.medium;
	}

	const allSelected = $derived(() => issues.length > 0 && selectedIssues.size === issues.length);
	const selectedCount = $derived(() => selectedIssues.size);
</script>

{#if visible}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
		<div class="bg-bg-card border border-border rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col">
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-border">
				<div>
					<h3 class="text-lg font-semibold text-text">Import GitHub Issues</h3>
					<p class="text-sm text-text-muted">Select issues to import as pipeline tasks</p>
				</div>
				<button 
					onclick={close}
					class="text-text-muted hover:text-text transition-colors"
				>
					×
				</button>
			</div>

			<!-- Content -->
			<div class="flex-1 overflow-hidden flex flex-col">
				{#if loading}
					<div class="flex-1 flex items-center justify-center">
						<div class="text-center">
							<div class="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
							<p class="text-sm text-text-muted">Loading GitHub issues...</p>
						</div>
					</div>
				{:else if error}
					<div class="flex-1 flex items-center justify-center">
						<div class="text-center max-w-md">
							<p class="text-sm text-error mb-3">Failed to load issues</p>
							<p class="text-xs text-text-muted mb-4">{error}</p>
							<button 
								onclick={() => { error = null; fetchIssues(); }}
								class="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-accent-hover transition-colors"
							>
								Retry
							</button>
						</div>
					</div>
				{:else if issues.length === 0}
					<div class="flex-1 flex items-center justify-center">
						<div class="text-center">
							<p class="text-sm text-text-muted">No GitHub issues found</p>
							<p class="text-xs text-text-dim">This repository has no open or closed issues</p>
						</div>
					</div>
				{:else}
					<!-- Selection Header -->
					<div class="p-4 border-b border-border bg-bg-hover/30">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<label class="flex items-center gap-2 cursor-pointer">
									<input 
										type="checkbox" 
										checked={allSelected()}
										onchange={toggleAll}
										class="w-4 h-4"
									/>
									<span class="text-sm text-text">Select All ({issues.length})</span>
								</label>
								{#if selectedCount() > 0}
									<span class="text-sm text-accent">{selectedCount()} selected</span>
								{/if}
							</div>
							<div class="text-xs text-text-muted">
								Issues will be imported as pipeline tasks
							</div>
						</div>
					</div>

					<!-- Issues List -->
					<div class="flex-1 overflow-y-auto p-4 space-y-3">
						{#each issues as issue}
							<div class="border border-border rounded-lg p-4 hover:border-border-light transition-colors {selectedIssues.has(issue.number) ? 'bg-accent/5 border-accent/30' : 'bg-bg-card'}">
								<div class="flex items-start gap-3">
									<!-- Checkbox -->
									<input 
										type="checkbox" 
										checked={selectedIssues.has(issue.number)}
										onchange={() => toggleIssue(issue.number)}
										class="w-4 h-4 mt-1 flex-shrink-0"
									/>
									
									<!-- Issue Content -->
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2 mb-2">
											<span class="text-sm font-medium text-text">#{issue.number}</span>
											<h4 class="text-sm text-text line-clamp-1 font-medium">{issue.title}</h4>
											<span class="text-[10px] px-2 py-0.5 rounded bg-border/50 text-text-muted">{issue.state}</span>
										</div>
										
										{#if issue.body}
											<p class="text-xs text-text-muted line-clamp-2 mb-2">{issue.body}</p>
										{/if}
										
										<!-- Labels -->
										{#if issue.labels.length > 0}
											<div class="flex flex-wrap gap-1 mb-2">
												{#each issue.labels as label}
													<span 
														class="text-[10px] px-2 py-0.5 rounded-full text-white text-opacity-90"
														style={getLabelColor(label.color)}
													>
														{label.name}
													</span>
												{/each}
											</div>
										{/if}
										
										<!-- Priority Selection -->
										<div class="flex items-center gap-2">
											<label class="text-xs text-text-muted">Priority:</label>
											<select 
												bind:value={issuePriorities[issue.number]}
												class="text-xs px-2 py-1 bg-bg border border-border rounded focus:border-accent focus:outline-none {getPriorityColor(issuePriorities[issue.number])}"
											>
												<option value="low">Low</option>
												<option value="medium">Medium</option>
												<option value="high">High</option>
												<option value="urgent">Urgent</option>
											</select>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			{#if !loading && !error && issues.length > 0}
				<div class="p-4 border-t border-border flex items-center justify-between">
					<div class="text-sm text-text-muted">
						{selectedCount()} issues selected for import
					</div>
					<div class="flex gap-3">
						<button 
							onclick={close}
							class="px-4 py-2 text-sm bg-bg-hover border border-border rounded hover:border-border-light transition-colors"
						>
							Cancel
						</button>
						<button 
							onclick={importSelected}
							disabled={selectedCount() === 0 || importing}
							class="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{importing ? 'Importing...' : `Import ${selectedCount()} Issue${selectedCount() === 1 ? '' : 's'}`}
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
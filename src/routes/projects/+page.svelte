<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll, goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { STACK_TYPE_COLORS } from '$lib/types';
	import { formatTimestamp } from '$lib/time-utils';
	import ProjectCreateModal from '$lib/components/projects/ProjectCreateModal.svelte';

	let { data }: { data: PageData } = $props();

	let refreshInterval: ReturnType<typeof setInterval>;
	let showCreateModal = $state(false);
	let searchQuery = $state('');
	let stackFilter = $state('');
	let sortBy = $state('name');

	onMount(() => { refreshInterval = setInterval(() => invalidateAll(), 10000); });
	onDestroy(() => clearInterval(refreshInterval));

	function getProjectColor(stackType: string): { bg: string; text: string } {
		return STACK_TYPE_COLORS[stackType] || STACK_TYPE_COLORS.default;
	}

	// Filter and sort projects
	const filteredProjects = $derived(data.projects
		.filter(project => {
			// Search filter
			if (searchQuery && !project.name.toLowerCase().includes(searchQuery.toLowerCase())) {
				return false;
			}
			// Stack filter
			if (stackFilter && project.stack_type !== stackFilter) {
				return false;
			}
			return true;
		})
		.sort((a, b) => {
			switch (sortBy) {
				case 'name':
					return a.name.localeCompare(b.name);
				case 'updated':
					return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
				case 'tasks':
					return (b.total_tasks || 0) - (a.total_tasks || 0);
				default:
					return 0;
			}
		}));

	// Get unique stack types for filter
	const stackTypes = $derived([...new Set(data.projects.map(p => p.stack_type))].sort());

	function viewProject(projectSlug: string) {
		goto(`/projects/${projectSlug}`);
	}

	function filterByProject(projectSlug: string) {
		goto(`/?project=${projectSlug}`);
	}

	function openInGitHub(repoUrl: string | null, event: Event) {
		event.stopPropagation();
		if (repoUrl) {
			window.open(repoUrl, '_blank');
		}
	}

	async function onProjectCreated(event: CustomEvent) {
		await invalidateAll();
		showCreateModal = false;
	}
</script>

<div class="p-6">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-lg font-semibold text-text">Projects</h1>
			<p class="text-xs text-text-muted mt-0.5">Manage your development projects</p>
		</div>
		<button 
			onclick={() => showCreateModal = true}
			class="px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent-hover transition-colors"
		>
			+ New Project
		</button>
	</div>

	<!-- Search and Filter -->
	<div class="flex items-center gap-4 mb-6">
		<div class="flex-1">
			<input 
				bind:value={searchQuery}
				placeholder="Search projects..."
				class="w-full px-3 py-2 border border-border bg-bg-card text-text text-sm rounded focus:border-accent focus:outline-none"
			/>
		</div>
		
		<select 
			bind:value={stackFilter}
			class="px-3 py-2 border border-border bg-bg-card text-text text-sm rounded focus:border-accent focus:outline-none"
		>
			<option value="">All stacks</option>
			{#each stackTypes as stackType}
				<option value={stackType}>{stackType}</option>
			{/each}
		</select>
		
		<select 
			bind:value={sortBy}
			class="px-3 py-2 border border-border bg-bg-card text-text text-sm rounded focus:border-accent focus:outline-none"
		>
			<option value="name">Sort by name</option>
			<option value="updated">Sort by updated</option>
			<option value="tasks">Sort by task count</option>
		</select>
	</div>

	<div class="space-y-3">
		{#each filteredProjects as project}
			{@const colors = getProjectColor(project.stack_type)}
			<div class="bg-bg-card border border-border rounded-lg p-5 hover:border-border-light transition-all cursor-pointer group" onclick={() => viewProject(project.slug)}>
				<div class="flex items-center justify-between mb-3">
					<div class="flex-1">
						<div class="flex items-center gap-3 mb-2">
							<h3 class="text-sm font-semibold text-text">{project.name}</h3>
							<span class="text-[10px] px-2 py-0.5 rounded {colors.bg} {colors.text}">{project.stack_type}</span>
							<span class="text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success">{project.status}</span>
							
							<!-- Tags -->
							{#if project.tags && project.tags.length > 0}
								{#each project.tags.slice(0, 2) as tag}
									<span class="text-[10px] px-2 py-0.5 bg-accent/20 text-accent rounded-full">#{tag}</span>
								{/each}
								{#if project.tags.length > 2}
									<span class="text-[10px] text-text-dim">+{project.tags.length - 2}</span>
								{/if}
							{/if}
						</div>
						
						{#if project.description}
							<p class="text-xs text-text-muted mb-1 line-clamp-1">{project.description}</p>
						{/if}
						
						<p class="text-[10px] text-text-dim font-mono">{project.repo_path}</p>
					</div>
					
					<div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
						<button 
							onclick={(e) => (e.stopPropagation(), viewProject(project.slug))}
							class="px-2 py-1 text-xs bg-accent/20 text-accent border border-accent/30 rounded hover:bg-accent/30 transition-colors"
							title="View Details"
						>
							Details
						</button>
						
						<button 
							onclick={(e) => (e.stopPropagation(), filterByProject(project.slug))}
							class="px-2 py-1 text-xs bg-bg-hover border border-border rounded hover:border-border-light transition-colors"
							title="View Tasks"
						>
							Tasks
						</button>
						
						{#if project.repo_url}
							<button 
								onclick={(e) => openInGitHub(project.repo_url, e)}
								class="px-2 py-1 text-xs bg-bg-hover border border-border rounded hover:border-border-light transition-colors"
								title="Open in GitHub"
							>
								GitHub
							</button>
						{/if}
					</div>
				</div>
				
				<div class="flex items-center gap-4 text-xs">
					<span class="text-text-muted">{project.total_tasks || 0} total tasks</span>
					{#if project.task_counts?.done}
						<span class="text-green-400">{project.task_counts.done} done</span>
					{/if}
					{#each Object.entries(project.task_counts || {}).filter(([k]) => !['done', 'queued'].includes(k)) as [status, count]}
						<span class="text-blue-400">{count} {status}</span>
					{/each}
					{#if project.task_counts?.queued}
						<span class="text-text-dim">{project.task_counts.queued} queued</span>
					{/if}
				</div>
				
				<div class="mt-3 text-[10px] text-text-dim">
					Updated {formatTimestamp(project.updated_at)}
				</div>
			</div>
		{/each}
		
		{#if filteredProjects.length === 0 && data.projects.length > 0}
			<div class="text-center py-12 text-xs text-text-dim">
				No projects match your search criteria.
			</div>
		{:else if data.projects.length === 0}
			<div class="text-center py-12 text-xs text-text-dim">
				<p class="mb-4">No projects yet. Create your first project to get started!</p>
				<button 
					onclick={() => showCreateModal = true}
					class="px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent-hover transition-colors"
				>
					+ Create Your First Project
				</button>
			</div>
		{/if}
	</div>
</div>

<!-- Project Creation Modal -->
<ProjectCreateModal 
	bind:show={showCreateModal} 
	on:created={onProjectCreated}
	on:close={() => showCreateModal = false}
/>

<style>
	.line-clamp-1 {
		display: -webkit-box;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>

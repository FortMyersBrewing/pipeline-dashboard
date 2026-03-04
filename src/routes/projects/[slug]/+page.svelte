<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import { STACK_TYPE_COLORS, STATUS_COLORS, STAGE_LABELS } from '$lib/types';
	import { formatTimestamp } from '$lib/time-utils';

	let { data }: { data: PageData } = $props();

	let refreshInterval: ReturnType<typeof setInterval>;
	let isEditing = $state(false);
	let editForm = $state({
		name: '',
		description: '',
		tags: [] as string[],
		env_notes: ''
	});

	// Update form when data changes
	$effect(() => {
		editForm.name = data.project.name;
		editForm.description = data.project.description || '';
		editForm.tags = data.project.tags || [];
		editForm.env_notes = data.project.env_notes || '';
	});

	onMount(() => { 
		refreshInterval = setInterval(() => invalidateAll(), 10000); 
	});
	onDestroy(() => clearInterval(refreshInterval));

	function getStackColor(stackType: string): { bg: string; text: string } {
		return STACK_TYPE_COLORS[stackType] || STACK_TYPE_COLORS.default;
	}

	function getStatusColor(status: string): { bg: string; text: string } {
		return STATUS_COLORS[status] || { bg: 'bg-bg', text: 'text-text' };
	}

	async function saveProject() {
		try {
			const response = await fetch(`/api/projects/${data.project.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(editForm)
			});
			
			if (response.ok) {
				isEditing = false;
				await invalidateAll();
			} else {
				const error = await response.json();
				alert(`Failed to save: ${error.error}`);
			}
		} catch (err) {
			alert('Failed to save project');
		}
	}

	async function deleteProject() {
		if (!confirm(`Are you sure you want to delete "${data.project.name}"? This action cannot be undone.`)) {
			return;
		}
		
		try {
			const response = await fetch(`/api/projects/${data.project.id}`, {
				method: 'DELETE'
			});
			
			if (response.ok) {
				goto('/projects');
			} else {
				const error = await response.json();
				alert(`Failed to delete: ${error.error}`);
			}
		} catch (err) {
			alert('Failed to delete project');
		}
	}

	function openInGitHub() {
		if (data.project.repo_url) {
			window.open(data.project.repo_url, '_blank');
		}
	}

	function addTag() {
		const tag = prompt('Enter tag name:')?.trim();
		if (tag && !editForm.tags.includes(tag)) {
			editForm.tags = [...editForm.tags, tag];
		}
	}

	function removeTag(index: number) {
		editForm.tags = editForm.tags.filter((_, i) => i !== index);
	}

	function groupTasksByStatus(tasks: any[]) {
		const groups: Record<string, any[]> = {
			queued: [],
			in_progress: [],
			review: [],
			done: [],
			failed: []
		};
		
		for (const task of tasks) {
			if (groups[task.status]) {
				groups[task.status].push(task);
			} else {
				groups.other = groups.other || [];
				groups.other.push(task);
			}
		}
		
		return groups;
	}

	const stackColors = $derived(getStackColor(data.project.stack_type));
	const statusColors = $derived(getStatusColor(data.project.status));
	const taskGroups = $derived(groupTasksByStatus(data.tasks));
</script>

<svelte:head>
	<title>{data.project.name} - Pipeline Dashboard</title>
</svelte:head>

<div class="p-6">
	<!-- Header -->
	<div class="flex items-center justify-between mb-6">
		<div class="flex items-center gap-3">
			<button onclick={() => goto('/projects')} class="text-text-muted hover:text-text transition-colors">
				← Projects
			</button>
			<h1 class="text-lg font-semibold text-text">{data.project.name}</h1>
			<span class="text-[10px] px-2 py-0.5 rounded {stackColors.bg} {stackColors.text}">
				{data.project.stack_type}
			</span>
			<span class="text-[10px] px-2 py-0.5 rounded-full {statusColors.bg} {statusColors.text}">
				{data.project.status}
			</span>
		</div>
		
		<div class="flex items-center gap-2">
			{#if data.project.repo_url}
				<button 
					onclick={openInGitHub}
					class="px-3 py-1 text-xs bg-bg-hover border border-border rounded hover:border-border-light transition-colors"
				>
					Open in GitHub
				</button>
			{/if}
			<button 
				onclick={() => isEditing = !isEditing}
				class="px-3 py-1 text-xs bg-accent/20 text-accent border border-accent/30 rounded hover:bg-accent/30 transition-colors"
			>
				{isEditing ? 'Cancel' : 'Edit'}
			</button>
			<button 
				onclick={deleteProject}
				class="px-3 py-1 text-xs bg-red-600/20 text-red-400 border border-red-600/30 rounded hover:bg-red-600/30 transition-colors"
			>
				Delete
			</button>
		</div>
	</div>

	<!-- Project Info -->
	<div class="bg-bg-card border border-border rounded-lg p-5 mb-6">
		{#if isEditing}
			<div class="space-y-4">
				<div>
					<label class="block text-xs font-medium text-text-muted mb-2">Name</label>
					<input 
						bind:value={editForm.name}
						class="w-full px-3 py-2 border border-border bg-bg-card text-text text-sm rounded focus:border-accent focus:outline-none"
					/>
				</div>
				
				<div>
					<label class="block text-xs font-medium text-text-muted mb-2">Description</label>
					<textarea 
						bind:value={editForm.description}
						rows="3"
						class="w-full px-3 py-2 border border-border bg-bg-card text-text text-sm rounded focus:border-accent focus:outline-none resize-none"
						placeholder="Describe this project..."
					></textarea>
				</div>
				
				<div>
					<label class="block text-xs font-medium text-text-muted mb-2">Tags</label>
					<div class="flex flex-wrap gap-2 mb-2">
						{#each editForm.tags as tag, i}
							<span class="px-2 py-1 text-xs bg-accent/20 text-accent rounded-full flex items-center gap-1">
								{tag}
								<button onclick={() => removeTag(i)} class="text-accent/60 hover:text-accent">×</button>
							</span>
						{/each}
						<button 
							onclick={addTag}
							class="px-2 py-1 text-xs border border-border-light rounded-full hover:border-accent transition-colors"
						>
							+ Add Tag
						</button>
					</div>
				</div>
				
				<div>
					<label class="block text-xs font-medium text-text-muted mb-2">Environment Notes</label>
					<textarea 
						bind:value={editForm.env_notes}
						rows="4"
						class="w-full px-3 py-2 border border-border bg-bg-card text-text text-sm rounded focus:border-accent focus:outline-none resize-none"
						placeholder="Runtime configuration, environment variables, deployment notes..."
					></textarea>
				</div>
				
				<div class="flex gap-2">
					<button 
						onclick={saveProject}
						class="px-4 py-2 text-xs bg-accent text-white rounded hover:bg-accent-hover transition-colors"
					>
						Save Changes
					</button>
					<button 
						onclick={() => isEditing = false}
						class="px-4 py-2 text-xs bg-bg-hover border border-border rounded hover:border-border-light transition-colors"
					>
						Cancel
					</button>
				</div>
			</div>
		{:else}
			{#if data.project.description}
				<p class="text-sm text-text mb-4">{data.project.description}</p>
			{/if}
			
			{#if data.project.tags && data.project.tags.length > 0}
				<div class="flex flex-wrap gap-2 mb-4">
					{#each data.project.tags as tag}
						<span class="px-2 py-1 text-xs bg-accent/20 text-accent rounded-full">{tag}</span>
					{/each}
				</div>
			{/if}
			
			<div class="text-xs text-text-muted space-y-1">
				<p><span class="font-medium">Path:</span> {data.project.repo_path}</p>
				{#if data.project.repo_url}
					<p><span class="font-medium">GitHub:</span> {data.project.repo_url}</p>
				{/if}
				<p><span class="font-medium">Created:</span> {formatTimestamp(data.project.created_at)}</p>
				<p><span class="font-medium">Updated:</span> {formatTimestamp(data.project.updated_at)}</p>
			</div>
		{/if}
	</div>

	<!-- README -->
	{#if data.readme}
		<div class="bg-bg-card border border-border rounded-lg p-5 mb-6">
			<h2 class="text-sm font-semibold text-text mb-4">README</h2>
			<div class="prose prose-invert max-w-none text-sm">
				<pre class="whitespace-pre-wrap text-xs text-text-muted bg-bg p-3 rounded">{data.readme}</pre>
			</div>
		</div>
	{/if}

	<!-- Tasks Section -->
	<div class="bg-bg-card border border-border rounded-lg p-5 mb-6">
		<div class="flex items-center justify-between mb-4">
			<h2 class="text-sm font-semibold text-text">Tasks ({data.project.total_tasks})</h2>
			<button class="px-3 py-1 text-xs bg-accent/20 text-accent border border-accent/30 rounded hover:bg-accent/30 transition-colors">
				+ New Task
			</button>
		</div>
		
		{#if data.tasks.length > 0}
			<div class="grid grid-cols-1 md:grid-cols-5 gap-4">
				{#each Object.entries(taskGroups) as [status, tasks]}
					{#if tasks.length > 0}
						<div class="space-y-2">
							<h3 class="text-xs font-medium text-text-muted uppercase tracking-wide">
								{status.replace('_', ' ')} ({tasks.length})
							</h3>
							{#each tasks as task}
								{@const colors = getStatusColor(task.status)}
								<div class="bg-bg border border-border rounded p-3 hover:border-border-light transition-colors">
									<div class="flex items-center gap-2 mb-2">
										<span class="text-xs px-2 py-0.5 rounded {colors.bg} {colors.text}">
											{task.status}
										</span>
										{#if task.current_stage}
											<span class="text-xs text-text-dim">
												{STAGE_LABELS[task.current_stage] || task.current_stage}
											</span>
										{/if}
									</div>
									<h4 class="text-sm font-medium text-text mb-1">{task.title}</h4>
									{#if task.description}
										<p class="text-xs text-text-muted line-clamp-2">{task.description}</p>
									{/if}
									<p class="text-xs text-text-dim mt-2">
										{formatTimestamp(task.created_at)}
									</p>
								</div>
							{/each}
						</div>
					{/if}
				{/each}
			</div>
		{:else}
			<div class="text-center py-8 text-xs text-text-dim">
				No tasks yet. Create your first task to get started.
			</div>
		{/if}
	</div>

	<!-- Activity Feed -->
	<div class="bg-bg-card border border-border rounded-lg p-5 mb-6">
		<h2 class="text-sm font-semibold text-text mb-4">Recent Activity</h2>
		
		{#if data.events.length > 0}
			<div class="space-y-3">
				{#each data.events as event}
					{@const typedEvent = event as any}
					<div class="flex items-start gap-3">
						<div class="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"></div>
						<div class="flex-1 min-w-0">
							<p class="text-sm text-text">{typedEvent.message}</p>
							{#if typedEvent.task_title}
								<p class="text-xs text-text-muted">Task: {typedEvent.task_title}</p>
							{/if}
							<p class="text-xs text-text-dim">{formatTimestamp(typedEvent.created_at)}</p>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="text-center py-8 text-xs text-text-dim">
				No activity yet.
			</div>
		{/if}
	</div>

	<!-- Environment Notes -->
	{#if data.project.env_notes && !isEditing}
		<div class="bg-bg-card border border-border rounded-lg p-5">
			<h2 class="text-sm font-semibold text-text mb-4">Environment Notes</h2>
			<div class="prose prose-invert max-w-none text-sm">
				<pre class="whitespace-pre-wrap text-xs text-text-muted bg-bg p-3 rounded">{data.project.env_notes}</pre>
			</div>
		</div>
	{/if}
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
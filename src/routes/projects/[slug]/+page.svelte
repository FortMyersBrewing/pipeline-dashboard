<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import type { ProjectDoc, Task } from '$lib/types';
	import { STACK_TYPE_COLORS, STATUS_COLORS, STAGE_LABELS } from '$lib/types';
	import { formatTimestamp } from '$lib/time-utils';
	import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
	import DocumentCard from '$lib/components/DocumentCard.svelte';
	import KanbanBoard from '$lib/components/KanbanBoard.svelte';
	import PipelineLaunchWizard from '$lib/components/pipeline/PipelineLaunchWizard.svelte';
	// Phase 4 imports
	import CIStatusBadge from '$lib/components/projects/CIStatusBadge.svelte';
	import HealthIndicator from '$lib/components/projects/HealthIndicator.svelte';
	import DependenciesSection from '$lib/components/projects/DependenciesSection.svelte';
	import GitHistoryTab from '$lib/components/projects/GitHistoryTab.svelte';
	import IssueImportModal from '$lib/components/projects/IssueImportModal.svelte';

	let { data }: { data: PageData } = $props();

	let refreshInterval: ReturnType<typeof setInterval>;
	let isEditing = $state(false);
	let activeTab = $state<'overview' | 'docs' | 'kanban' | 'activity' | 'git-history'>('overview');
	let showDocEditor = $state(false);
	let editingDoc = $state<ProjectDoc | null>(null);
	let showNewDocForm = $state(false);
	let isEditingEnvNotes = $state(false);
	let showLaunchWizard = $state(false);
	// Phase 4 state
	let showIssueImport = $state(false);
	let allProjects = $state<any[]>([]);

	let editForm = $state({
		name: '',
		description: '',
		tags: [] as string[],
		env_notes: ''
	});

	let newDocForm = $state({
		title: '',
		doc_type: 'notes' as ProjectDoc['doc_type']
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
		// Fetch all projects for dependencies
		fetchAllProjects();
	});
	onDestroy(() => clearInterval(refreshInterval));

	// Fetch all projects for dependency management
	async function fetchAllProjects() {
		try {
			const response = await fetch('/api/projects');
			if (response.ok) {
				allProjects = await response.json();
			}
		} catch (err) {
			console.error('Failed to fetch projects:', err);
		}
	}

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

	// Document management functions
	function openDocEditor(doc?: ProjectDoc) {
		editingDoc = doc || null;
		showDocEditor = true;
		showNewDocForm = false;
	}

	function closeDocEditor() {
		showDocEditor = false;
		editingDoc = null;
		showNewDocForm = false;
	}

	async function saveDocument(content: string) {
		if (!editingDoc && !showNewDocForm) return;

		try {
			let response;
			
			if (editingDoc) {
				// Update existing document
				response = await fetch(`/api/projects/${data.project.id}/docs/${editingDoc.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ content })
				});
			} else if (showNewDocForm) {
				// Create new document
				response = await fetch(`/api/projects/${data.project.id}/docs`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						title: newDocForm.title,
						doc_type: newDocForm.doc_type,
						content
					})
				});
			}

			if (response?.ok) {
				await invalidateAll();
			} else {
				const error = await response?.json();
				throw new Error(error?.error || 'Failed to save');
			}
		} catch (err) {
			console.error('Failed to save document:', err);
			throw err;
		}
	}

	async function createNewDoc() {
		if (!newDocForm.title.trim()) {
			alert('Please enter a document title');
			return;
		}

		try {
			const response = await fetch(`/api/projects/${data.project.id}/docs`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newDocForm)
			});

			if (response.ok) {
				const newDoc = await response.json();
				showNewDocForm = false;
				newDocForm.title = '';
				newDocForm.doc_type = 'notes';
				openDocEditor(newDoc);
				await invalidateAll();
			} else {
				const error = await response.json();
				alert(`Failed to create document: ${error.error}`);
			}
		} catch (err) {
			alert('Failed to create document');
		}
	}

	async function deleteDoc(docId: number) {
		if (!confirm('Are you sure you want to delete this document?')) {
			return;
		}

		try {
			const response = await fetch(`/api/projects/${data.project.id}/docs/${docId}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				await invalidateAll();
			} else {
				const error = await response.json();
				alert(`Failed to delete: ${error.error}`);
			}
		} catch (err) {
			alert('Failed to delete document');
		}
	}

	async function handleTaskUpdate(taskId: string, updates: Partial<Task>) {
		const response = await fetch(`/api/tasks/${taskId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updates)
		});

		if (!response.ok) {
			throw new Error('Failed to update task');
		}

		await invalidateAll();
	}

	async function handleTaskCreate(title: string) {
		const response = await fetch('/api/tasks', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				project_id: data.project.id,
				title,
				status: 'queued'
			})
		});

		if (!response.ok) {
			throw new Error('Failed to create task');
		}

		await invalidateAll();
	}

	function openLaunchWizard() {
		showLaunchWizard = true;
	}

	function closeLaunchWizard() {
		showLaunchWizard = false;
	}

	async function handleLaunch(event: CustomEvent) {
		const { tasks } = event.detail;
		console.log('Launched tasks:', tasks);
		await invalidateAll();
		// Could show a success notification here
	}

	async function saveEnvNotes(content: string) {
		try {
			const response = await fetch(`/api/projects/${data.project.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ env_notes: content })
			});

			if (response.ok) {
				await invalidateAll();
			} else {
				const error = await response.json();
				throw new Error(error.error || 'Failed to save');
			}
		} catch (err) {
			console.error('Failed to save environment notes:', err);
			throw err;
		}
	}

	// Phase 4 functions
	function handleIssueImported(event: CustomEvent) {
		const { count, tasks } = event.detail;
		alert(`Successfully imported ${count} issue${count === 1 ? '' : 's'} as pipeline tasks`);
		invalidateAll();
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
			<div class="flex items-center gap-2">
				<HealthIndicator projectId={data.project.id} size="md" />
				<h1 class="text-lg font-semibold text-text">{data.project.name}</h1>
			</div>
			<span class="text-[10px] px-2 py-0.5 rounded {stackColors.bg} {stackColors.text}">
				{data.project.stack_type}
			</span>
			<span class="text-[10px] px-2 py-0.5 rounded-full {statusColors.bg} {statusColors.text}">
				{data.project.status}
			</span>
			{#if data.project.repo_url}
				<CIStatusBadge projectId={data.project.id} size="md" showLabel={false} />
			{/if}
		</div>
		
		<div class="flex items-center gap-2">
			<button 
				onclick={openLaunchWizard}
				class="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-accent-hover transition-colors flex items-center gap-2"
			>
				🚀 Launch Pipeline
			</button>
			{#if data.project.repo_url}
				<button 
					onclick={() => showIssueImport = true}
					class="px-3 py-1 text-xs bg-info/20 text-info border border-info/30 rounded hover:bg-info/30 transition-colors"
				>
					Import Issues
				</button>
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

	<!-- Tabs -->
	<div class="flex gap-1 mb-6 border-b border-border">
		<button 
			onclick={() => activeTab = 'overview'}
			class="px-4 py-2 text-sm transition-colors {activeTab === 'overview' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text'}"
		>
			Overview
		</button>
		<button 
			onclick={() => activeTab = 'docs'}
			class="px-4 py-2 text-sm transition-colors {activeTab === 'docs' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text'}"
		>
			Documents ({data.docs?.length || 0})
		</button>
		<button 
			onclick={() => activeTab = 'kanban'}
			class="px-4 py-2 text-sm transition-colors {activeTab === 'kanban' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text'}"
		>
			Kanban ({data.tasks?.length || 0})
		</button>
		<button 
			onclick={() => activeTab = 'git-history'}
			class="px-4 py-2 text-sm transition-colors {activeTab === 'git-history' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text'}"
		>
			Git History
		</button>
		<button 
			onclick={() => activeTab = 'activity'}
			class="px-4 py-2 text-sm transition-colors {activeTab === 'activity' ? 'text-accent border-b-2 border-accent' : 'text-text-muted hover:text-text'}"
		>
			Activity
		</button>
	</div>

	<!-- Tab Content -->
	{#if activeTab === 'overview'}
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

		<!-- Dependencies Section -->
		<div class="bg-bg-card border border-border rounded-lg p-5 mb-6">
			<DependenciesSection projectId={data.project.id} allProjects={allProjects} />
		</div>

		<!-- Environment Notes -->
		<div class="bg-bg-card border border-border rounded-lg p-5">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-sm font-semibold text-text">Environment Notes</h2>
				<button 
					onclick={() => isEditingEnvNotes = !isEditingEnvNotes}
					class="px-3 py-1 text-xs bg-accent/20 text-accent border border-accent/30 rounded hover:bg-accent/30 transition-colors"
				>
					{isEditingEnvNotes ? 'Cancel' : 'Edit'}
				</button>
			</div>
			
			{#if isEditingEnvNotes}
				<MarkdownEditor 
					bind:value={editForm.env_notes}
					placeholder="Runtime configuration, environment variables, deployment notes..."
					onSave={saveEnvNotes}
					autosave={true}
				/>
			{:else if data.project.env_notes}
				<div class="prose prose-invert max-w-none text-sm">
					<pre class="whitespace-pre-wrap text-xs text-text-muted bg-bg p-3 rounded">{data.project.env_notes}</pre>
				</div>
			{:else}
				<div class="text-center py-8 text-xs text-text-dim">
					No environment notes yet. Click Edit to add some.
				</div>
			{/if}
		</div>

	{:else if activeTab === 'docs'}
		<!-- Documents Section -->
		<div class="bg-bg-card border border-border rounded-lg p-5">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-sm font-semibold text-text">Documents</h2>
				<button 
					onclick={() => showNewDocForm = true}
					class="px-3 py-1 text-xs bg-accent/20 text-accent border border-accent/30 rounded hover:bg-accent/30 transition-colors"
				>
					+ New Document
				</button>
			</div>
			
			{#if data.docs && data.docs.length > 0}
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{#each data.docs as doc}
						<DocumentCard doc={doc as ProjectDoc} onclick={openDocEditor} />
					{/each}
				</div>
			{:else}
				<div class="text-center py-8 text-xs text-text-dim">
					No documents yet. Create your first document to get started.
				</div>
			{/if}
		</div>

	{:else if activeTab === 'kanban'}
		<!-- Kanban Board -->
		<KanbanBoard 
			tasks={data.tasks as Task[]} 
			projectId={data.project.id}
			onTaskUpdate={handleTaskUpdate}
			onTaskCreate={handleTaskCreate}
		/>

	{:else if activeTab === 'git-history'}
		<!-- Git History Tab -->
		<div class="bg-bg-card border border-border rounded-lg p-5">
			<GitHistoryTab projectId={data.project.id} />
		</div>

	{:else if activeTab === 'activity'}
		<!-- Activity Feed -->
		<div class="bg-bg-card border border-border rounded-lg p-5">
			<h2 class="text-sm font-semibold text-text mb-4">Recent Activity</h2>
			
			{#if data.events && data.events.length > 0}
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
	{/if}
</div>

<!-- Document Editor Modal -->
{#if showDocEditor || showNewDocForm}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
		<div class="bg-bg-card border border-border rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
			<div class="flex items-center justify-between p-4 border-b border-border">
				<h3 class="text-sm font-semibold text-text">
					{editingDoc ? `Edit: ${editingDoc.title}` : 'New Document'}
				</h3>
				<button 
					onclick={closeDocEditor}
					class="text-text-muted hover:text-text transition-colors"
				>
					×
				</button>
			</div>

			{#if showNewDocForm}
				<div class="p-4 border-b border-border">
					<div class="flex gap-4">
						<div class="flex-1">
							<label class="block text-xs font-medium text-text-muted mb-2">Title</label>
							<input 
								bind:value={newDocForm.title}
								placeholder="Document title"
								class="w-full px-3 py-2 border border-border bg-bg-card text-text text-sm rounded focus:border-accent focus:outline-none"
							/>
						</div>
						<div>
							<label class="block text-xs font-medium text-text-muted mb-2">Type</label>
							<select 
								bind:value={newDocForm.doc_type}
								class="px-3 py-2 border border-border bg-bg-card text-text text-sm rounded focus:border-accent focus:outline-none"
							>
								<option value="notes">📝 Notes</option>
								<option value="spec">📋 Spec</option>
								<option value="design">🎨 Design</option>
								<option value="architecture">🏗️ Architecture</option>
								<option value="reference">📎 Reference</option>
							</select>
						</div>
						<div class="flex items-end">
							<button 
								onclick={createNewDoc}
								class="px-4 py-2 text-xs bg-accent text-white rounded hover:bg-accent-hover transition-colors"
							>
								Create
							</button>
						</div>
					</div>
				</div>
			{/if}

			<div class="h-[60vh] overflow-hidden">
				<MarkdownEditor 
					value={editingDoc?.content || ''}
					onSave={saveDocument}
					autosave={true}
				/>
			</div>

			{#if editingDoc}
				<div class="p-4 border-t border-border flex justify-between">
					<div class="text-xs text-text-muted">
						Version {editingDoc.version} • Last updated {formatTimestamp(editingDoc.updated_at)}
					</div>
					<button 
						onclick={() => deleteDoc(editingDoc!.id)}
						class="px-3 py-1 text-xs bg-red-600/20 text-red-400 border border-red-600/30 rounded hover:bg-red-600/30 transition-colors"
					>
						Delete
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<!-- Pipeline Launch Wizard -->
<PipelineLaunchWizard 
	projectId={data.project.id}
	projectName={data.project.name}
	projectDocs={data.docs as ProjectDoc[] || []}
	visible={showLaunchWizard}
	defaultPriority={data.project.default_priority}
	defaultBranch={data.project.default_branch}
	on:close={closeLaunchWizard}
	on:launch={handleLaunch}
/>

<!-- Issue Import Modal -->
<IssueImportModal
	projectId={data.project.id}
	visible={showIssueImport}
	on:close={() => showIssueImport = false}
	on:imported={handleIssueImported}
/>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { STACK_TYPE_COLORS } from '$lib/types';
	import type { ProjectCreateRequest, GitHubRepo } from '$lib/types';

	let { show = $bindable() }: { show: boolean } = $props();

	const dispatch = createEventDispatcher();

	let form: ProjectCreateRequest = $state({
		name: '',
		slug: '',
		description: '',
		stack_type: 'node',
		repo_path: '',
		repo_url: '',
		github_action: 'none',
		github_repo: '',
		github_visibility: 'private',
		tags: [],
		default_priority: 'medium'
	});

	let loading = $state(false);
	let githubRepos: GitHubRepo[] = $state([]);
	let loadingRepos = $state(false);
	let newTag = $state('');
	let errors: Record<string, string> = $state({});

	// Auto-generate slug from name
	$effect(() => {
		if (form.name && !form.slug) {
			form.slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
		}
	});

	// Auto-generate repo path
	$effect(() => {
		if (form.slug && !form.repo_path) {
			form.repo_path = `~/projects/${form.slug}`;
		}
	});

	const stackOptions = [
		{ value: 'python', label: 'Python', color: STACK_TYPE_COLORS.python },
		{ value: 'node', label: 'Node.js', color: STACK_TYPE_COLORS.node },
		{ value: 'rust', label: 'Rust', color: STACK_TYPE_COLORS.rust },
		{ value: 'go', label: 'Go', color: STACK_TYPE_COLORS.go },
		{ value: 'java', label: 'Java', color: STACK_TYPE_COLORS.java },
		{ value: 'shell', label: 'Shell', color: STACK_TYPE_COLORS.shell }
	];

	async function loadGitHubRepos() {
		if (githubRepos.length > 0) return;
		
		loadingRepos = true;
		try {
			const response = await fetch('/api/github/repos');
			if (response.ok) {
				githubRepos = await response.json();
			} else {
				const error = await response.json();
				errors.github = error.error || 'Failed to load repositories';
			}
		} catch (err) {
			errors.github = 'Failed to connect to GitHub';
		} finally {
			loadingRepos = false;
		}
	}

	function addTag() {
		if (newTag.trim() && !form.tags?.includes(newTag.trim())) {
			form.tags = [...(form.tags || []), newTag.trim()];
			newTag = '';
		}
	}

	function removeTag(index: number) {
		if (form.tags) {
			form.tags = form.tags.filter((_, i) => i !== index);
		}
	}

	async function createProject() {
		errors = {};
		
		// Validation
		if (!form.name.trim()) {
			errors.name = 'Name is required';
		}
		if (!form.stack_type) {
			errors.stack_type = 'Stack type is required';
		}
		
		if (Object.keys(errors).length > 0) {
			return;
		}
		
		loading = true;
		try {
			const response = await fetch('/api/projects', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});
			
			if (response.ok) {
				const project = await response.json();
				dispatch('created', project);
				close();
			} else {
				const error = await response.json();
				errors.general = error.error || 'Failed to create project';
			}
		} catch (err) {
			errors.general = 'Failed to create project';
		} finally {
			loading = false;
		}
	}

	function close() {
		dispatch('close');
		// Reset form
		form = {
			name: '',
			slug: '',
			description: '',
			stack_type: 'node',
			repo_path: '',
			repo_url: '',
			github_action: 'none',
			github_repo: '',
			github_visibility: 'private',
			tags: [],
			default_priority: 'medium'
		};
		errors = {};
	}
</script>

{#if show}
	<!-- Modal backdrop -->
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onclick={close}>
		<!-- Modal content -->
		<div class="bg-bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto" onclick={(e) => e.stopPropagation()}>
			<div class="p-6">
				<div class="flex items-center justify-between mb-6">
					<h2 class="text-lg font-semibold text-text">Create New Project</h2>
					<button onclick={close} class="text-text-muted hover:text-text">×</button>
				</div>

				{#if errors.general}
					<div class="bg-red-600/20 text-red-400 p-3 rounded mb-4 text-sm">
						{errors.general}
					</div>
				{/if}

				<form onsubmit={(e) => {e.preventDefault(); createProject();}} class="space-y-6">
					<!-- Basic Info -->
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class="block text-xs font-medium text-text-muted mb-2">Name *</label>
							<input 
								bind:value={form.name}
								class="w-full px-3 py-2 border border-border bg-bg text-text text-sm rounded focus:border-accent focus:outline-none"
								class:border-red-500={errors.name}
								placeholder="My Awesome Project"
								required
							/>
							{#if errors.name}
								<p class="text-xs text-red-400 mt-1">{errors.name}</p>
							{/if}
						</div>

						<div>
							<label class="block text-xs font-medium text-text-muted mb-2">Slug</label>
							<input 
								bind:value={form.slug}
								class="w-full px-3 py-2 border border-border bg-bg text-text text-sm rounded focus:border-accent focus:outline-none"
								placeholder="my-awesome-project"
							/>
						</div>
					</div>

					<div>
						<label class="block text-xs font-medium text-text-muted mb-2">Description</label>
						<textarea 
							bind:value={form.description}
							rows="3"
							class="w-full px-3 py-2 border border-border bg-bg text-text text-sm rounded focus:border-accent focus:outline-none resize-none"
							placeholder="What does this project do?"
						></textarea>
					</div>

					<!-- Stack Type -->
					<div>
						<label class="block text-xs font-medium text-text-muted mb-2">Stack Type *</label>
						<div class="grid grid-cols-3 gap-2">
							{#each stackOptions as option}
								<label class="flex items-center gap-2 p-3 border border-border rounded cursor-pointer hover:border-border-light transition-colors"
									class:border-accent={form.stack_type === option.value}
									class:bg-accent={form.stack_type === option.value}>
								>
									<input 
										type="radio" 
										bind:group={form.stack_type} 
										value={option.value}
										class="sr-only"
									/>
									<span class="text-xs px-2 py-0.5 rounded {option.color.bg} {option.color.text}">
										{option.label}
									</span>
								</label>
							{/each}
						</div>
						{#if errors.stack_type}
							<p class="text-xs text-red-400 mt-1">{errors.stack_type}</p>
						{/if}
					</div>

					<!-- Tags -->
					<div>
						<label class="block text-xs font-medium text-text-muted mb-2">Tags</label>
						<div class="flex flex-wrap gap-2 mb-2">
							{#each form.tags || [] as tag, i}
								<span class="px-2 py-1 text-xs bg-accent/20 text-accent rounded-full flex items-center gap-1">
									{tag}
									<button type="button" onclick={() => removeTag(i)} class="text-accent/60 hover:text-accent">×</button>
								</span>
							{/each}
						</div>
						<div class="flex gap-2">
							<input 
								bind:value={newTag}
								onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
								class="flex-1 px-3 py-2 border border-border bg-bg text-text text-sm rounded focus:border-accent focus:outline-none"
								placeholder="Add a tag..."
							/>
							<button type="button" onclick={addTag} class="px-3 py-2 text-xs bg-bg-hover border border-border rounded hover:border-border-light">
								Add
							</button>
						</div>
					</div>

					<!-- GitHub Integration -->
					<div>
						<label class="block text-xs font-medium text-text-muted mb-2">GitHub Integration</label>
						<div class="space-y-3">
							<label class="flex items-center gap-2">
								<input type="radio" bind:group={form.github_action} value="none" />
								<span class="text-sm">None (local only)</span>
							</label>

							<label class="flex items-center gap-2">
								<input type="radio" bind:group={form.github_action} value="import" />
								<span class="text-sm">Import from GitHub</span>
							</label>

							{#if form.github_action === 'import'}
								<div class="ml-6 space-y-2">
									{#if !githubRepos.length}
										<button 
											type="button" 
											onclick={loadGitHubRepos}
											disabled={loadingRepos}
											class="text-xs text-accent hover:text-accent-hover"
										>
											{loadingRepos ? 'Loading...' : 'Browse FMB Repositories'}
										</button>
									{:else}
										<select 
											bind:value={form.github_repo}
											class="w-full px-3 py-2 border border-border bg-bg text-text text-sm rounded focus:border-accent focus:outline-none"
										>
											<option value="">Select a repository...</option>
											{#each githubRepos as repo}
												<option value={repo.name}>
													{repo.name} {repo.description ? `- ${repo.description}` : ''}
												</option>
											{/each}
										</select>
									{/if}
									{#if errors.github}
										<p class="text-xs text-red-400">{errors.github}</p>
									{/if}
								</div>
							{/if}

							<label class="flex items-center gap-2">
								<input type="radio" bind:group={form.github_action} value="link" />
								<span class="text-sm">Link existing repository</span>
							</label>

							{#if form.github_action === 'link'}
								<div class="ml-6">
									<input 
										bind:value={form.repo_url}
										class="w-full px-3 py-2 border border-border bg-bg text-text text-sm rounded focus:border-accent focus:outline-none"
										placeholder="https://github.com/owner/repo"
									/>
								</div>
							{/if}
						</div>
					</div>

					<!-- Local Path -->
					<div>
						<label class="block text-xs font-medium text-text-muted mb-2">Local Path</label>
						<input 
							bind:value={form.repo_path}
							class="w-full px-3 py-2 border border-border bg-bg text-text text-sm rounded focus:border-accent focus:outline-none"
							placeholder="~/projects/my-project"
						/>
					</div>

					<!-- Priority -->
					<div>
						<label class="block text-xs font-medium text-text-muted mb-2">Default Priority</label>
						<select 
							bind:value={form.default_priority}
							class="px-3 py-2 border border-border bg-bg text-text text-sm rounded focus:border-accent focus:outline-none"
						>
							<option value="low">Low</option>
							<option value="medium">Medium</option>
							<option value="high">High</option>
							<option value="urgent">Urgent</option>
						</select>
					</div>

					<!-- Actions -->
					<div class="flex gap-3 pt-4 border-t border-border">
						<button 
							type="submit"
							disabled={loading}
							class="px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent-hover transition-colors disabled:opacity-50"
						>
							{loading ? 'Creating...' : 'Create Project'}
						</button>
						<button 
							type="button"
							onclick={close}
							class="px-4 py-2 bg-bg-hover border border-border text-sm rounded hover:border-border-light transition-colors"
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}
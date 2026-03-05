<script lang="ts">
	interface Project {
		id: string;
		name: string;
		slug: string;
		stack_type: string;
	}

	interface Dependency {
		dep_id: number;
		project_id: string;
		project_name: string;
		project_slug: string;
		stack_type: string;
		note: string | null;
		created_at: string;
	}

	interface DependencyData {
		depends_on: Dependency[];
		depended_by: Dependency[];
		total_dependencies: number;
		total_dependents: number;
	}

	interface Props {
		projectId: string;
		allProjects?: Project[];
	}

	let { projectId, allProjects = [] }: Props = $props();

	let dependencyData = $state<DependencyData | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let showAddForm = $state(false);
	let selectedProject = $state('');
	let note = $state('');
	let adding = $state(false);

	// Fetch dependency data
	async function fetchDependencies() {
		loading = true;
		error = null;
		
		try {
			const response = await fetch(`/api/projects/${projectId}/deps`);
			if (response.ok) {
				dependencyData = await response.json();
			} else {
				const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
				error = errorData.error || 'Failed to fetch dependencies';
			}
		} catch (err) {
			error = 'Failed to fetch dependencies';
			console.error('Dependencies fetch error:', err);
		} finally {
			loading = false;
		}
	}

	// Add dependency
	async function addDependency() {
		if (!selectedProject) return;
		
		adding = true;
		try {
			const response = await fetch(`/api/projects/${projectId}/deps`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					depends_on: selectedProject,
					note: note.trim() || null
				})
			});
			
			if (response.ok) {
				showAddForm = false;
				selectedProject = '';
				note = '';
				await fetchDependencies();
			} else {
				const errorData = await response.json();
				alert(errorData.error || 'Failed to add dependency');
			}
		} catch (err) {
			alert('Failed to add dependency');
		} finally {
			adding = false;
		}
	}

	// Remove dependency
	async function removeDependency(depId: number) {
		if (!confirm('Remove this dependency?')) return;
		
		try {
			const response = await fetch(`/api/projects/${projectId}/deps?dep_id=${depId}`, {
				method: 'DELETE'
			});
			
			if (response.ok) {
				await fetchDependencies();
			} else {
				const errorData = await response.json();
				alert(errorData.error || 'Failed to remove dependency');
			}
		} catch (err) {
			alert('Failed to remove dependency');
		}
	}

	// Available projects (excluding current project and existing dependencies)
	const availableProjects = $derived(() => {
		if (!allProjects || !dependencyData) return [];
		
		const existingDepIds = new Set(dependencyData.depends_on.map(d => d.project_id));
		return allProjects.filter(p => p.id !== projectId && !existingDepIds.has(p.id));
	});

	// Fetch on mount
	$effect(() => {
		fetchDependencies();
	});

	// Stack type colors
	function getStackColor(stackType: string) {
		const colors: Record<string, string> = {
			python: 'text-blue-400',
			node: 'text-green-400',
			rust: 'text-orange-400',
			go: 'text-cyan-400',
			java: 'text-red-400',
			shell: 'text-gray-400',
			other: 'text-gray-400'
		};
		return colors[stackType] || colors.other;
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-semibold text-text">Dependencies</h3>
		<button 
			onclick={() => showAddForm = !showAddForm}
			class="px-3 py-1 text-xs bg-accent/20 text-accent border border-accent/30 rounded hover:bg-accent/30 transition-colors"
		>
			{showAddForm ? 'Cancel' : '+ Add'}
		</button>
	</div>

	{#if showAddForm}
		<div class="p-4 bg-bg-hover border border-border rounded">
			<div class="space-y-3">
				<div>
					<label class="block text-xs font-medium text-text-muted mb-1">Depends on project:</label>
					<select 
						bind:value={selectedProject}
						class="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded focus:border-accent focus:outline-none"
						disabled={availableProjects().length === 0}
					>
						<option value="">Select project...</option>
						{#each availableProjects() as project}
							<option value={project.id}>{project.name} ({project.stack_type})</option>
						{/each}
					</select>
					{#if availableProjects().length === 0}
						<p class="text-xs text-text-dim mt-1">No projects available to depend on</p>
					{/if}
				</div>
				
				<div>
					<label class="block text-xs font-medium text-text-muted mb-1">Reason (optional):</label>
					<input 
						bind:value={note}
						placeholder="Why does this project depend on the other?"
						class="w-full px-3 py-2 text-sm bg-bg-card border border-border rounded focus:border-accent focus:outline-none"
					/>
				</div>
				
				<div class="flex gap-2">
					<button 
						onclick={addDependency}
						disabled={!selectedProject || adding}
						class="px-4 py-2 text-xs bg-accent text-white rounded hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{adding ? 'Adding...' : 'Add Dependency'}
					</button>
					<button 
						onclick={() => { showAddForm = false; selectedProject = ''; note = ''; }}
						class="px-4 py-2 text-xs bg-bg-card border border-border rounded hover:border-border-light transition-colors"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	{/if}

	{#if loading}
		<div class="space-y-2">
			<div class="h-4 bg-border/50 rounded animate-pulse"></div>
			<div class="h-4 bg-border/50 rounded animate-pulse w-3/4"></div>
		</div>
	{:else if error}
		<div class="p-3 bg-error/10 border border-error/30 rounded text-error text-sm">
			{error}
		</div>
	{:else if dependencyData}
		<div class="space-y-4">
			<!-- Depends On -->
			<div>
				<h4 class="text-xs font-medium text-text-muted mb-2">Depends On ({dependencyData.total_dependencies})</h4>
				{#if dependencyData.depends_on.length === 0}
					<p class="text-xs text-text-dim italic">No dependencies</p>
				{:else}
					<div class="space-y-2">
						{#each dependencyData.depends_on as dep}
							<div class="flex items-center justify-between p-2 bg-bg-card border border-border rounded">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<a 
											href="/projects/{dep.project_slug}"
											class="text-sm text-accent hover:underline font-medium"
										>
											{dep.project_name}
										</a>
										<span class="text-xs {getStackColor(dep.stack_type)}">{dep.stack_type}</span>
									</div>
									{#if dep.note}
										<p class="text-xs text-text-muted mt-1">{dep.note}</p>
									{/if}
								</div>
								<button 
									onclick={() => removeDependency(dep.dep_id)}
									class="text-xs text-error hover:text-red-400 transition-colors ml-2"
									title="Remove dependency"
								>
									×
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Depended By -->
			<div>
				<h4 class="text-xs font-medium text-text-muted mb-2">Depended By ({dependencyData.total_dependents})</h4>
				{#if dependencyData.depended_by.length === 0}
					<p class="text-xs text-text-dim italic">No dependents</p>
				{:else}
					<div class="space-y-2">
						{#each dependencyData.depended_by as dep}
							<div class="flex items-center p-2 bg-bg-card border border-border rounded">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<a 
											href="/projects/{dep.project_slug}"
											class="text-sm text-accent hover:underline font-medium"
										>
											{dep.project_name}
										</a>
										<span class="text-xs {getStackColor(dep.stack_type)}">{dep.stack_type}</span>
									</div>
									{#if dep.note}
										<p class="text-xs text-text-muted mt-1">{dep.note}</p>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { ProjectDoc } from '$lib/types';
	import WizardStep1Tasks from './WizardStep1Tasks.svelte';
	import WizardStep2Context from './WizardStep2Context.svelte';
	import WizardStep3Config from './WizardStep3Config.svelte';
	import WizardStep4Review from './WizardStep4Review.svelte';

	interface Props {
		projectId: string;
		projectName: string;
		projectDocs: ProjectDoc[];
		visible: boolean;
		defaultPriority?: string;
		defaultBranch?: string;
	}

	let { 
		projectId, 
		projectName, 
		projectDocs, 
		visible, 
		defaultPriority = 'medium',
		defaultBranch = 'main'
	}: Props = $props();

	const dispatch = createEventDispatcher();

	interface TaskFormData {
		title: string;
		description: string;
		priority: 'low' | 'medium' | 'high' | 'urgent';
	}

	interface LaunchConfig {
		maxAttempts: number;
		branchStrategy: 'main' | 'feature' | 'custom';
		customBranch?: string;
	}

	interface WizardState {
		currentStep: 1 | 2 | 3 | 4;
		tasks: TaskFormData[];
		selectedDocs: number[];
		selectedFiles: string[];
		config: LaunchConfig;
		contextPreview: string;
		tokenEstimate: number;
		isLaunching: boolean;
	}

	let state = $state<WizardState>({
		currentStep: 1,
		tasks: [{
			title: '',
			description: '',
			priority: defaultPriority as any
		}],
		selectedDocs: [],
		selectedFiles: [],
		config: {
			maxAttempts: 3,
			branchStrategy: defaultBranch === 'main' ? 'main' : 'feature',
			customBranch: undefined
		},
		contextPreview: '',
		tokenEstimate: 0,
		isLaunching: false
	});

	function closeWizard() {
		dispatch('close');
		resetWizard();
	}

	function resetWizard() {
		state.currentStep = 1;
		state.tasks = [{
			title: '',
			description: '',
			priority: defaultPriority as any
		}];
		state.selectedDocs = [];
		state.selectedFiles = [];
		state.contextPreview = '';
		state.tokenEstimate = 0;
		state.isLaunching = false;
	}

	function nextStep() {
		if (state.currentStep < 4) {
			state.currentStep = (state.currentStep + 1) as any;
		}
	}

	function prevStep() {
		if (state.currentStep > 1) {
			state.currentStep = (state.currentStep - 1) as any;
		}
	}

	function canProceed(): boolean {
		switch (state.currentStep) {
			case 1:
				return state.tasks.every(t => t.title.trim() && t.description.trim());
			case 2:
				return true; // Context selection is optional
			case 3:
				return state.config.branchStrategy !== 'custom' || !!state.config.customBranch?.trim();
			case 4:
				return !state.isLaunching;
			default:
				return false;
		}
	}

	async function updateContext() {
		if (state.selectedDocs.length === 0 && state.selectedFiles.length === 0) {
			state.contextPreview = '';
			state.tokenEstimate = 0;
			return;
		}

		try {
			const response = await fetch(`/api/projects/${projectId}/assemble-context`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					doc_ids: state.selectedDocs,
					file_paths: state.selectedFiles
				})
			});

			if (response.ok) {
				const data = await response.json();
				state.contextPreview = data.context;
				state.tokenEstimate = data.token_estimate;
			}
		} catch (err) {
			console.error('Failed to update context:', err);
		}
	}

	async function launchTasks() {
		state.isLaunching = true;
		
		try {
			const response = await fetch(`/api/projects/${projectId}/launch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tasks: state.tasks,
					context: {
						doc_ids: state.selectedDocs,
						file_paths: state.selectedFiles
					},
					config: state.config
				})
			});

			if (response.ok) {
				const data = await response.json();
				dispatch('launch', { tasks: data.tasks });
				closeWizard();
			} else {
				const error = await response.json();
				alert(`Failed to launch tasks: ${error.error}`);
			}
		} catch (err) {
			alert('Failed to launch tasks');
		} finally {
			state.isLaunching = false;
		}
	}

	// Update context when selections change
	$effect(() => {
		if (state.currentStep === 2 || state.currentStep > 2) {
			updateContext();
		}
	});
</script>

<!-- Modal Background -->
{#if visible}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
		<div class="bg-bg-card border border-border rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
			<!-- Header -->
			<div class="flex items-center justify-between p-6 border-b border-border">
				<div>
					<h2 class="text-lg font-semibold text-text">🚀 Launch Pipeline</h2>
					<p class="text-sm text-text-muted">Create and launch tasks for {projectName}</p>
				</div>
				<button 
					onclick={closeWizard}
					class="text-text-muted hover:text-text transition-colors text-xl"
				>
					×
				</button>
			</div>

			<!-- Progress Steps -->
			<div class="flex items-center justify-center px-6 py-4 border-b border-border">
				<div class="flex items-center gap-4">
					{#each [1, 2, 3, 4] as step}
						<div class="flex items-center gap-2">
							<div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium
								{state.currentStep >= step ? 'bg-accent text-white' : 'bg-bg-hover text-text-muted'}">
								{step}
							</div>
							{#if step < 4}
								<div class="w-8 h-px 
									{state.currentStep > step ? 'bg-accent' : 'bg-border'}">
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<!-- Step Content -->
			<div class="p-6 overflow-y-auto max-h-[60vh]">
				{#if state.currentStep === 1}
					<WizardStep1Tasks bind:tasks={state.tasks} />
				{:else if state.currentStep === 2}
					<WizardStep2Context 
						{projectId}
						{projectDocs}
						bind:selectedDocs={state.selectedDocs}
						bind:selectedFiles={state.selectedFiles}
						contextPreview={state.contextPreview}
						tokenEstimate={state.tokenEstimate}
					/>
				{:else if state.currentStep === 3}
					<WizardStep3Config bind:config={state.config} />
				{:else if state.currentStep === 4}
					<WizardStep4Review 
						tasks={state.tasks}
						selectedDocs={state.selectedDocs.map(id => projectDocs.find(d => d.id === id)).filter(Boolean)}
						selectedFiles={state.selectedFiles}
						config={state.config}
						tokenEstimate={state.tokenEstimate}
					/>
				{/if}
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-between p-6 border-t border-border">
				<button 
					onclick={prevStep}
					disabled={state.currentStep === 1}
					class="px-4 py-2 text-sm border border-border rounded hover:border-border-light transition-colors
						disabled:opacity-50 disabled:cursor-not-allowed"
				>
					← Previous
				</button>
				
				<div class="flex items-center gap-3">
					{#if state.currentStep < 4}
						<button 
							onclick={nextStep}
							disabled={!canProceed()}
							class="px-6 py-2 text-sm bg-accent text-white rounded hover:bg-accent-hover transition-colors
								disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Next →
						</button>
					{:else}
						<button 
							onclick={launchTasks}
							disabled={!canProceed()}
							class="px-6 py-2 text-sm bg-accent text-white rounded hover:bg-accent-hover transition-colors
								disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
						>
							{#if state.isLaunching}
								<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
								Launching...
							{:else}
								🚀 Launch Pipeline
							{/if}
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	
	let { 
		value = $bindable(''), 
		placeholder = '',
		autosave = true,
		autosaveDelay = 2000,
		onSave
	}: {
		value: string;
		placeholder?: string;
		autosave?: boolean;
		autosaveDelay?: number;
		onSave?: (content: string) => Promise<void>;
	} = $props();

	let editorContainer: HTMLElement;
	let previewContainer: HTMLElement;
	let editorView: any;
	let saveTimeout: ReturnType<typeof setTimeout>;
	let lastSaved = $state('');
	let isLoading = $state(true);
	let isDirty = $derived(value !== lastSaved);

	onMount(async () => {
		try {
			// Dynamic imports to avoid SSR issues
			const { EditorView, keymap } = await import('@codemirror/view');
			const { EditorState } = await import('@codemirror/state');
			const { markdown } = await import('@codemirror/lang-markdown');
			const { oneDark } = await import('@codemirror/theme-one-dark');
			const { defaultKeymap, indentWithTab } = await import('@codemirror/commands');

			// Create editor state
			const startState = EditorState.create({
				doc: value,
				extensions: [
					markdown(),
					oneDark,
					keymap.of([...defaultKeymap, indentWithTab]),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) {
							const newValue = update.state.doc.toString();
							value = newValue;
							updatePreview(newValue);
							scheduleAutosave(newValue);
						}
					}),
					EditorView.theme({
						'&': {
							height: '400px',
						},
						'.cm-content': {
							padding: '16px',
						},
						'.cm-focused': {
							outline: 'none',
						},
						'.cm-editor': {
							fontSize: '14px',
						}
					})
				]
			});

			// Create editor view
			editorView = new EditorView({
				state: startState,
				parent: editorContainer
			});

			// Initial preview render
			updatePreview(value);
			lastSaved = value;
			isLoading = false;

		} catch (error) {
			console.error('Failed to initialize editor:', error);
			isLoading = false;
		}
	});

	onDestroy(() => {
		if (editorView) {
			editorView.destroy();
		}
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}
	});

	function updatePreview(content: string) {
		if (previewContainer) {
			// Simple markdown-to-HTML conversion for preview
			// For production, consider using a proper markdown parser like marked
			const html = content
				.replace(/^### (.*$)/gim, '<h3>$1</h3>')
				.replace(/^## (.*$)/gim, '<h2>$1</h2>')
				.replace(/^# (.*$)/gim, '<h1>$1</h1>')
				.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
				.replace(/\*(.*)\*/gim, '<em>$1</em>')
				.replace(/`([^`]+)`/gim, '<code>$1</code>')
				.replace(/\n/gim, '<br>');
			
			previewContainer.innerHTML = html;
		}
	}

	function scheduleAutosave(content: string) {
		if (!autosave || !onSave) return;
		
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}
		
		saveTimeout = setTimeout(() => {
			handleSave(content);
		}, autosaveDelay);
	}

	async function handleSave(content?: string) {
		const contentToSave = content || value;
		if (!onSave || contentToSave === lastSaved) return;

		try {
			await onSave(contentToSave);
			lastSaved = contentToSave;
		} catch (error) {
			console.error('Failed to save:', error);
		}
	}

	function insertText(before: string, after = '') {
		if (!editorView) return;

		const selection = editorView.state.selection.main;
		const selectedText = editorView.state.sliceDoc(selection.from, selection.to);
		const replacement = before + selectedText + after;

		editorView.dispatch({
			changes: { from: selection.from, to: selection.to, insert: replacement },
			selection: { anchor: selection.from + before.length + selectedText.length + after.length }
		});

		editorView.focus();
	}

	function insertBold() { insertText('**', '**'); }
	function insertItalic() { insertText('*', '*'); }
	function insertCode() { insertText('`', '`'); }
	function insertLink() { insertText('[', '](url)'); }
	function insertList() { insertText('\n- '); }
	function insertH1() { insertText('\n# '); }
	function insertH2() { insertText('\n## '); }
	function insertH3() { insertText('\n### '); }
</script>

<div class="markdown-editor bg-bg-card border border-border rounded-lg overflow-hidden">
	<!-- Toolbar -->
	<div class="toolbar flex items-center gap-1 p-2 border-b border-border bg-bg-hover">
		<button 
			onclick={insertBold}
			class="p-1 text-xs hover:bg-bg-card rounded transition-colors"
			title="Bold"
		>
			<strong>B</strong>
		</button>
		<button 
			onclick={insertItalic}
			class="p-1 text-xs hover:bg-bg-card rounded transition-colors"
			title="Italic"
		>
			<em>I</em>
		</button>
		<div class="w-px h-4 bg-border"></div>
		<button 
			onclick={insertH1}
			class="px-2 py-1 text-xs hover:bg-bg-card rounded transition-colors"
			title="Heading 1"
		>
			H1
		</button>
		<button 
			onclick={insertH2}
			class="px-2 py-1 text-xs hover:bg-bg-card rounded transition-colors"
			title="Heading 2"
		>
			H2
		</button>
		<button 
			onclick={insertH3}
			class="px-2 py-1 text-xs hover:bg-bg-card rounded transition-colors"
			title="Heading 3"
		>
			H3
		</button>
		<div class="w-px h-4 bg-border"></div>
		<button 
			onclick={insertCode}
			class="px-2 py-1 text-xs hover:bg-bg-card rounded transition-colors font-mono"
			title="Code"
		>
			&lt;/&gt;
		</button>
		<button 
			onclick={insertLink}
			class="px-2 py-1 text-xs hover:bg-bg-card rounded transition-colors"
			title="Link"
		>
			🔗
		</button>
		<button 
			onclick={insertList}
			class="px-2 py-1 text-xs hover:bg-bg-card rounded transition-colors"
			title="List"
		>
			• List
		</button>
		
		<div class="flex-1"></div>
		
		{#if autosave && onSave}
			<div class="text-xs text-text-muted">
				{#if isDirty}
					<span class="text-warning">Unsaved changes</span>
				{:else}
					<span class="text-success">Saved</span>
				{/if}
			</div>
		{/if}
		
		{#if !autosave && onSave}
			<button 
				onclick={() => handleSave()}
				disabled={!isDirty}
				class="px-3 py-1 text-xs bg-accent text-white rounded hover:bg-accent-hover disabled:opacity-50 transition-colors"
			>
				Save
			</button>
		{/if}
	</div>

	<!-- Editor and Preview -->
	<div class="editor-content flex h-96">
		<!-- Editor -->
		<div class="flex-1 border-r border-border">
			{#if isLoading}
				<div class="flex items-center justify-center h-full text-text-muted">
					Loading editor...
				</div>
			{:else}
				<div bind:this={editorContainer} class="h-full"></div>
			{/if}
		</div>

		<!-- Preview -->
		<div class="flex-1 overflow-y-auto">
			<div 
				bind:this={previewContainer} 
				class="prose prose-invert max-w-none p-4 text-sm"
			></div>
		</div>
	</div>
</div>

<style>
	:global(.markdown-editor .prose h1) { 
		font-size: 1.2em; 
		font-weight: 600; 
		color: var(--text, #e0e0e0); 
		margin-bottom: 0.75rem; 
	}
	:global(.markdown-editor .prose h2) { 
		font-size: 1.1em; 
		font-weight: 600; 
		color: var(--text, #e0e0e0); 
		margin-bottom: 0.5rem; 
	}
	:global(.markdown-editor .prose h3) { 
		font-size: 1em; 
		font-weight: 600; 
		color: var(--text, #e0e0e0); 
		margin-bottom: 0.5rem; 
	}
	:global(.markdown-editor .prose p) { 
		color: var(--text-muted, #a0a0a0); 
		margin-bottom: 0.5rem; 
	}
	:global(.markdown-editor .prose strong) { 
		color: var(--text, #e0e0e0); 
		font-weight: 600; 
	}
	:global(.markdown-editor .prose em) { 
		color: var(--text, #e0e0e0); 
		font-style: italic; 
	}
	:global(.markdown-editor .prose code) { 
		background-color: var(--bg, #2a2a2a); 
		padding: 0.25rem; 
		border-radius: 0.25rem; 
		color: var(--accent, #4ade80); 
		font-size: 0.875rem; 
	}
	:global(.markdown-editor .prose br) { 
		display: block; 
		margin-bottom: 0.25rem; 
	}
</style>
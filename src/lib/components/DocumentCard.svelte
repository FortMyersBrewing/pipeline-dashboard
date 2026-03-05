<script lang="ts">
	import type { ProjectDoc } from '$lib/types';
	import { formatTimestamp } from '$lib/time-utils';

	let { 
		doc, 
		onclick 
	}: {
		doc: ProjectDoc;
		onclick?: (doc: ProjectDoc) => void;
	} = $props();

	const docTypeIcons = {
		spec: '📋',
		design: '🎨',
		architecture: '🏗️',
		reference: '📎',
		notes: '📝'
	};

	function getPreview(content: string | undefined): string {
		if (!content) return 'No content yet...';
		
		// Remove markdown formatting for clean preview
		const cleaned = content
			.replace(/^#+\s+/gm, '') // Remove headers
			.replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
			.replace(/\*(.*?)\*/g, '$1') // Remove italic
			.replace(/`(.*?)`/g, '$1') // Remove code
			.replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links, keep text
			.replace(/^\s*[-*+]\s+/gm, '') // Remove list markers
			.replace(/\n+/g, ' ') // Replace newlines with spaces
			.trim();
		
		return cleaned.length > 120 ? cleaned.substring(0, 120) + '...' : cleaned;
	}

	const preview = $derived(getPreview(doc.content));
	const icon = $derived(docTypeIcons[doc.doc_type] || '📄');
</script>

<div 
	class="document-card bg-bg border border-border rounded-lg p-4 hover:border-border-light hover:shadow-sm transition-all cursor-pointer group"
	onclick={() => onclick?.(doc)}
>
	<div class="flex items-start gap-3">
		<div class="text-xl flex-shrink-0">{icon}</div>
		
		<div class="flex-1 min-w-0">
			<div class="flex items-center gap-2 mb-1">
				<h3 class="text-sm font-medium text-text truncate group-hover:text-accent transition-colors">
					{doc.title}
				</h3>
				<span class="text-xs text-text-dim capitalize">{doc.doc_type}</span>
			</div>
			
			{#if preview}
				<p class="text-xs text-text-muted line-clamp-2 mb-2">
					{preview}
				</p>
			{/if}
			
			<div class="flex items-center justify-between text-xs text-text-dim">
				<span>v{doc.version}</span>
				<span>{formatTimestamp(doc.updated_at)}</span>
			</div>
		</div>
	</div>
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
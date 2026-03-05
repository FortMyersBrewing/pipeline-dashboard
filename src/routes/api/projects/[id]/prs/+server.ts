import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getDb } from '$lib/db';

const execAsync = promisify(exec);

export const GET: RequestHandler = async ({ params, url }) => {
	const projectId = params.id;
	const limit = parseInt(url.searchParams.get('limit') || '10');
	const state = url.searchParams.get('state') || 'all'; // open, closed, merged, all
	
	try {
		const db = getDb();
		
		// Get project details
		const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}
		
		if (!project.repo_url) {
			return json({ error: 'Project has no GitHub repository URL' }, { status: 400 });
		}
		
		// Extract owner/repo from URL
		const match = project.repo_url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
		if (!match) {
			return json({ error: 'Invalid GitHub repository URL' }, { status: 400 });
		}
		
		const [, owner, repo] = match;
		const repoIdentifier = `${owner}/${repo}`;
		
		// Build gh command with state filter
		let stateArg = '';
		if (state === 'open') {
			stateArg = '--state open';
		} else if (state === 'closed') {
			stateArg = '--state closed';
		} else if (state === 'merged') {
			stateArg = '--state merged';
		}
		// 'all' doesn't need a state arg - gh pr list shows all by default
		
		// Fetch pull requests
		const { stdout } = await execAsync(
			`gh pr list --repo ${repoIdentifier} ${stateArg} --json number,title,state,author,createdAt,url,mergeable,mergedAt,closedAt --limit ${limit}`
		);
		
		if (!stdout.trim()) {
			return json({
				project_id: projectId,
				repo_url: project.repo_url,
				prs: [],
				total: 0
			});
		}
		
		const prs = JSON.parse(stdout);
		
		// Transform and enrich PR data
		const transformedPrs = prs.map((pr: any) => ({
			number: pr.number,
			title: pr.title,
			state: pr.state,
			author: pr.author?.login || 'Unknown',
			author_avatar: pr.author?.avatarUrl || null,
			created_at: pr.createdAt,
			merged_at: pr.mergedAt || null,
			closed_at: pr.closedAt || null,
			url: pr.url,
			mergeable: pr.mergeable,
			// Determine display state
			display_state: getDisplayState(pr.state, pr.mergedAt, pr.closedAt),
			// Calculate time info
			time_ago: getTimeAgo(pr.createdAt)
		}));
		
		return json({
			project_id: projectId,
			repo_url: project.repo_url,
			prs: transformedPrs,
			total: transformedPrs.length,
			filters: { state, limit }
		});
		
	} catch (error) {
		console.error('Failed to fetch pull requests:', error);
		
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		
		if (errorMsg.includes('not found') || errorMsg.includes('404')) {
			return json({ 
				error: 'Repository not found or not accessible' 
			}, { status: 404 });
		}
		
		if (errorMsg.includes('authentication') || errorMsg.includes('401')) {
			return json({ 
				error: 'GitHub authentication required. Please run: gh auth login' 
			}, { status: 401 });
		}
		
		return json({ 
			error: 'Failed to fetch pull requests. Ensure the repository exists and is accessible.' 
		}, { status: 500 });
	}
};

function getDisplayState(state: string, mergedAt: string | null, closedAt: string | null): string {
	if (state === 'OPEN') return 'open';
	if (state === 'MERGED' || mergedAt) return 'merged';
	if (state === 'CLOSED' || closedAt) return 'closed';
	return state.toLowerCase();
}

function getTimeAgo(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
	const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
	const diffMinutes = Math.floor(diffMs / (1000 * 60));
	
	if (diffDays > 0) {
		return `${diffDays}d ago`;
	} else if (diffHours > 0) {
		return `${diffHours}h ago`;
	} else if (diffMinutes > 0) {
		return `${diffMinutes}m ago`;
	} else {
		return 'just now';
	}
}
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getDb } from '$lib/db';

const execAsync = promisify(exec);

export const GET: RequestHandler = async ({ params, url }) => {
	const projectId = params.id;
	const limit = parseInt(url.searchParams.get('limit') || '5');
	
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
		
		try {
			// Fetch workflow runs
			const { stdout } = await execAsync(
				`gh run list --repo ${repoIdentifier} --json status,conclusion,name,createdAt,url,workflowName,event,headBranch --limit ${limit}`
			);
			
			if (!stdout.trim()) {
				return json({
					project_id: projectId,
					repo_url: project.repo_url,
					ci_configured: false,
					runs: [],
					overall_status: 'none',
					latest_run: null
				});
			}
			
			const runs = JSON.parse(stdout);
			
			if (runs.length === 0) {
				return json({
					project_id: projectId,
					repo_url: project.repo_url,
					ci_configured: false,
					runs: [],
					overall_status: 'none',
					latest_run: null
				});
			}
			
			// Transform run data
			const transformedRuns = runs.map((run: any) => ({
				name: run.name || run.workflowName || 'Unknown Workflow',
				status: run.status, // queued, in_progress, completed
				conclusion: run.conclusion, // success, failure, cancelled, skipped, etc.
				created_at: run.createdAt,
				url: run.url,
				event: run.event, // push, pull_request, etc.
				branch: run.headBranch,
				// Derive display status
				display_status: getDisplayStatus(run.status, run.conclusion),
				time_ago: getTimeAgo(run.createdAt)
			}));
			
			// Calculate overall status from latest runs
			const overallStatus = calculateOverallStatus(transformedRuns);
			const latestRun = transformedRuns[0] || null;
			
			return json({
				project_id: projectId,
				repo_url: project.repo_url,
				ci_configured: true,
				runs: transformedRuns,
				overall_status: overallStatus,
				latest_run: latestRun,
				total_runs: transformedRuns.length
			});
			
		} catch (runError) {
			const errorMsg = runError instanceof Error ? runError.message : 'Unknown error';
			
			// If it's a 404 or "no workflow runs", CI might not be configured
			if (errorMsg.includes('404') || errorMsg.includes('no workflow runs')) {
				return json({
					project_id: projectId,
					repo_url: project.repo_url,
					ci_configured: false,
					runs: [],
					overall_status: 'none',
					latest_run: null
				});
			}
			
			throw runError; // Re-throw for general error handling
		}
		
	} catch (error) {
		console.error('Failed to fetch CI status:', error);
		
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
			error: 'Failed to fetch CI status. Ensure the repository exists and is accessible.' 
		}, { status: 500 });
	}
};

function getDisplayStatus(status: string, conclusion: string | null): 'running' | 'success' | 'failure' | 'pending' | 'cancelled' | 'skipped' {
	if (status === 'in_progress' || status === 'queued') {
		return 'running';
	}
	
	if (status === 'completed') {
		switch (conclusion) {
			case 'success':
				return 'success';
			case 'failure':
			case 'timed_out':
				return 'failure';
			case 'cancelled':
				return 'cancelled';
			case 'skipped':
				return 'skipped';
			default:
				return 'pending';
		}
	}
	
	return 'pending';
}

function calculateOverallStatus(runs: any[]): 'passing' | 'failing' | 'running' | 'none' {
	if (runs.length === 0) {
		return 'none';
	}
	
	// Check most recent runs
	const recentRuns = runs.slice(0, 3);
	
	// If any recent run is running, overall status is running
	if (recentRuns.some(run => run.display_status === 'running')) {
		return 'running';
	}
	
	// If the latest completed run failed, overall status is failing
	const latestCompleted = recentRuns.find(run => 
		run.display_status === 'success' || run.display_status === 'failure'
	);
	
	if (latestCompleted) {
		return latestCompleted.display_status === 'success' ? 'passing' : 'failing';
	}
	
	return 'none';
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
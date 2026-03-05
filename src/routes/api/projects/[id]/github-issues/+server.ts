import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getDb } from '$lib/db';

const execAsync = promisify(exec);

export const GET: RequestHandler = async ({ params }) => {
	const projectId = params.id;
	
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
		
		// Fetch GitHub issues
		const { stdout } = await execAsync(`gh issue list --repo ${repoIdentifier} --json number,title,body,labels,state,url --limit 50`);
		const issues = JSON.parse(stdout);
		
		// Transform issues to include additional metadata
		const transformedIssues = issues.map((issue: any) => ({
			number: issue.number,
			title: issue.title,
			body: issue.body || '',
			labels: issue.labels || [],
			state: issue.state,
			url: issue.url,
			// Suggest priority based on labels
			suggested_priority: getSuggestedPriority(issue.labels || [])
		}));
		
		return json({
			project_id: projectId,
			repo_url: project.repo_url,
			issues: transformedIssues,
			total: transformedIssues.length
		});
		
	} catch (error) {
		console.error('Failed to fetch GitHub issues:', error);
		
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
			error: 'Failed to fetch GitHub issues. Ensure the repository exists and is accessible.' 
		}, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, params }) => {
	const projectId = params.id;
	const body = await request.json();
	const { selected_issues = [] } = body;
	
	if (!Array.isArray(selected_issues) || selected_issues.length === 0) {
		return json({ error: 'No issues selected for import' }, { status: 400 });
	}
	
	try {
		const db = getDb();
		
		// Get project details
		const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}
		
		const insertTask = db.prepare(`
			INSERT INTO tasks (
				id, project_id, title, description, status, priority
			) VALUES (?, ?, ?, ?, ?, ?)
		`);
		
		const createdTasks = [];
		
		// Create tasks from selected issues
		for (const issueData of selected_issues) {
			const taskId = crypto.randomUUID();
			const priority = issueData.priority || 'medium';
			const description = `**Imported from GitHub Issue #${issueData.number}**\n\n${issueData.body || 'No description provided.'}\n\n[View on GitHub](${issueData.url})`;
			
			insertTask.run(
				taskId,
				projectId,
				issueData.title,
				description,
				'queued',
				priority
			);
			
			createdTasks.push({
				id: taskId,
				title: issueData.title,
				github_issue: issueData.number,
				priority
			});
		}
		
		return json({
			success: true,
			imported_count: createdTasks.length,
			created_tasks: createdTasks
		}, { status: 201 });
		
	} catch (error) {
		console.error('Failed to import GitHub issues:', error);
		return json({ 
			error: 'Failed to import GitHub issues' 
		}, { status: 500 });
	}
};

function getSuggestedPriority(labels: any[]): string {
	const labelNames = labels.map(l => l.name?.toLowerCase() || '');
	
	// Priority mapping based on common GitHub labels
	if (labelNames.some(l => l.includes('urgent') || l.includes('critical') || l.includes('blocker'))) {
		return 'urgent';
	}
	if (labelNames.some(l => l.includes('bug') || l.includes('high'))) {
		return 'high';
	}
	if (labelNames.some(l => l.includes('enhancement') || l.includes('feature'))) {
		return 'medium';
	}
	if (labelNames.some(l => l.includes('low') || l.includes('minor') || l.includes('documentation'))) {
		return 'low';
	}
	
	return 'medium'; // default
}
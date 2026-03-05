import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getDb } from '$lib/db';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export const GET: RequestHandler = async ({ params, url }) => {
	const projectId = params.id;
	const limit = parseInt(url.searchParams.get('limit') || '20');
	
	try {
		const db = getDb();
		
		// Get project details
		const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}
		
		if (!project.repo_path) {
			return json({ error: 'Project has no repository path' }, { status: 400 });
		}
		
		// Resolve tilde in path
		let repoPath = project.repo_path;
		if (repoPath.startsWith('~')) {
			repoPath = path.join(os.homedir(), repoPath.slice(1));
		}
		
		// Check if the repository exists
		try {
			await execAsync(`test -d "${repoPath}/.git"`);
		} catch {
			return json({ 
				error: 'Git repository not found at the specified path',
				path: project.repo_path 
			}, { status: 404 });
		}
		
		// Get recent commits using git log
		const gitCmd = `cd "${repoPath}" && git log --oneline -${limit} --format='%h|%s|%an|%ai|%ae'`;
		const { stdout } = await execAsync(gitCmd);
		
		if (!stdout.trim()) {
			return json({
				project_id: projectId,
				commits: [],
				total: 0
			});
		}
		
		// Parse commit data
		const commits = stdout.trim().split('\n').map(line => {
			const [sha, message, author, date, email] = line.split('|');
			return {
				sha: sha.trim(),
				message: message?.trim() || '',
				author: author?.trim() || '',
				author_email: email?.trim() || '',
				date: date?.trim() || '',
				// Create GitHub URL if we have repo_url
				github_url: project.repo_url ? `${project.repo_url}/commit/${sha}` : null
			};
		});
		
		return json({
			project_id: projectId,
			repo_path: project.repo_path,
			commits,
			total: commits.length
		});
		
	} catch (error) {
		console.error('Failed to fetch commits:', error);
		
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		
		if (errorMsg.includes('not a git repository')) {
			return json({ 
				error: 'Directory is not a Git repository'
			}, { status: 400 });
		}
		
		if (errorMsg.includes('permission denied') || errorMsg.includes('EACCES')) {
			return json({ 
				error: 'Permission denied accessing repository path' 
			}, { status: 403 });
		}
		
		return json({ 
			error: 'Failed to fetch commit history'
		}, { status: 500 });
	}
};
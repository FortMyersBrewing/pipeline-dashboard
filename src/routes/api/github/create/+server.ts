import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { name, description, private: isPrivate = true, org = 'FortMyersBrewing' } = body;
	
	if (!name) {
		return json({ error: 'Repository name is required' }, { status: 400 });
	}
	
	// Validate repository name (basic GitHub rules)
	if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
		return json({ 
			error: 'Repository name can only contain alphanumeric characters, periods, dashes, and underscores' 
		}, { status: 400 });
	}
	
	try {
		// Build command
		const visibility = isPrivate ? '--private' : '--public';
		const descArg = description ? `--description "${description.replace(/"/g, '\\"')}"` : '';
		const clonePath = `~/projects/${name}`;
		
		// Create GitHub repository with clone
		const createCmd = `gh repo create ${org}/${name} ${visibility} ${descArg} --clone ${clonePath}`.trim();
		const { stdout, stderr } = await execAsync(createCmd);
		
		// Build URLs
		const repo_url = `https://github.com/${org}/${name}`;
		const clone_path = clonePath;
		
		return json({
			success: true,
			repo_url,
			clone_path,
			name,
			org,
			private: isPrivate,
			description: description || null
		}, { status: 201 });
		
	} catch (error) {
		console.error('Failed to create GitHub repo:', error);
		
		const errorMsg = error instanceof Error ? error.message : 'Unknown error';
		
		// Handle common errors
		if (errorMsg.includes('already exists')) {
			return json({ 
				error: `Repository ${org}/${name} already exists` 
			}, { status: 409 });
		}
		
		if (errorMsg.includes('authentication') || errorMsg.includes('401')) {
			return json({ 
				error: 'GitHub authentication required. Please run: gh auth login' 
			}, { status: 401 });
		}
		
		if (errorMsg.includes('403')) {
			return json({ 
				error: `Permission denied. Check access to ${org} organization.` 
			}, { status: 403 });
		}
		
		if (errorMsg.includes('network') || errorMsg.includes('timeout')) {
			return json({ 
				error: 'Network error. Please check your internet connection.' 
			}, { status: 503 });
		}
		
		return json({ 
			error: `Failed to create repository: ${errorMsg}` 
		}, { status: 500 });
	}
};
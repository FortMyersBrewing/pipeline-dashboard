import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const GET: RequestHandler = async () => {
	try {
		// List FMB organization repositories
		const { stdout } = await execAsync('gh repo list FortMyersBrewing --json name,url,primaryLanguage,description --limit 50');
		const repos = JSON.parse(stdout);
		
		// Transform to match our GitHubRepo interface
		const transformed = repos.map((repo: any) => ({
			name: repo.name,
			url: repo.url,
			description: repo.description || null,
			primaryLanguage: repo.primaryLanguage?.name || null
		}));
		
		return json(transformed);
	} catch (error) {
		console.error('Failed to fetch GitHub repos:', error);
		
		// Check if it's an auth issue
		if (error instanceof Error && error.message.includes('authentication')) {
			return json({ 
				error: 'GitHub authentication required. Please run: gh auth login' 
			}, { status: 401 });
		}
		
		return json({ 
			error: 'Failed to fetch repositories. Ensure gh CLI is installed and authenticated.' 
		}, { status: 500 });
	}
};
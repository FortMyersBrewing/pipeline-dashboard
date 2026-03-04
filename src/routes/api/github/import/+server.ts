import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getDb } from '$lib/db';

const execAsync = promisify(exec);

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { repo_name, repo_url, auto_detect_stack = true } = body;
	
	if (!repo_name && !repo_url) {
		return json({ error: 'repo_name or repo_url is required' }, { status: 400 });
	}
	
	try {
		const db = getDb();
		
		// Get repository details
		const repoIdentifier = repo_name || repo_url;
		const { stdout } = await execAsync(`gh repo view ${repoIdentifier} --json name,url,description,primaryLanguage,owner`);
		const repoData = JSON.parse(stdout);
		
		// Auto-detect stack type from primary language
		let stack_type = 'other';
		if (auto_detect_stack && repoData.primaryLanguage) {
			const lang = repoData.primaryLanguage.name.toLowerCase();
			switch (lang) {
				case 'python':
					stack_type = 'python';
					break;
				case 'javascript':
				case 'typescript':
					stack_type = 'node';
					break;
				case 'rust':
					stack_type = 'rust';
					break;
				case 'go':
					stack_type = 'go';
					break;
				case 'java':
					stack_type = 'java';
					break;
				case 'shell':
				case 'bash':
					stack_type = 'shell';
					break;
				case 'svelte':
					stack_type = 'node'; // Svelte projects are typically Node-based
					break;
			}
		}
		
		// Generate project data
		const name = repoData.name;
		const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
		const id = crypto.randomUUID();
		
		// Check slug uniqueness
		const existing = db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug);
		if (existing) {
			return json({ error: `Project with slug '${slug}' already exists` }, { status: 400 });
		}
		
		// Create project
		const project = {
			id,
			name,
			slug,
			repo_path: `~/projects/${slug}`,
			repo_url: repoData.url,
			stack_type,
			status: 'active',
			description: repoData.description || null,
			github_org: repoData.owner?.login || null,
			default_priority: 'medium',
			default_branch: 'main'
		};
		
		db.prepare(`
			INSERT INTO projects (
				id, name, slug, repo_path, repo_url, stack_type, status,
				description, github_org, default_priority, default_branch
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(
			project.id, project.name, project.slug, project.repo_path, project.repo_url,
			project.stack_type, project.status, project.description, project.github_org,
			project.default_priority, project.default_branch
		);
		
		// Get the created project
		const created = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
		
		return json({
			success: true,
			project: created,
			detected_stack: stack_type,
			source: 'github_import'
		}, { status: 201 });
		
	} catch (error) {
		console.error('Failed to import GitHub repo:', error);
		
		if (error instanceof Error && error.message.includes('not found')) {
			return json({ error: 'Repository not found or not accessible' }, { status: 404 });
		}
		
		return json({ 
			error: 'Failed to import repository. Ensure the repository exists and is accessible.' 
		}, { status: 500 });
	}
};
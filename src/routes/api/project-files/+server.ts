import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readdirSync, statSync, existsSync } from 'fs';
import { resolve, join, relative } from 'path';
import { homedir } from 'os';
import { getDb } from '$lib/db';

export const GET: RequestHandler = ({ url }) => {
	const projectId = url.searchParams.get('project');
	const dir = url.searchParams.get('dir') || '';
	
	if (!projectId) {
		return json({ error: 'project parameter required' }, { status: 400 });
	}

	const db = getDb();
	const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
	
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	// Resolve project path (handle ~/... notation)
	let basePath = (project as { repo_path: string }).repo_path;
	if (basePath.startsWith('~/')) {
		basePath = resolve(homedir(), basePath.slice(2));
	}

	// Construct target directory
	const targetDir = resolve(basePath, dir);
	
	// Security check
	if (!targetDir.startsWith(basePath)) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	if (!existsSync(targetDir)) {
		return json({ error: 'Directory not found' }, { status: 404 });
	}

	try {
		const entries = readdirSync(targetDir)
			.filter(name => !name.startsWith('.') && !IGNORED_DIRS.has(name))
			.sort();
			
		const items = entries.map(name => {
			const fullPath = join(targetDir, name);
			const stat = statSync(fullPath);
			return {
				name,
				path: relative(basePath, fullPath),
				type: stat.isDirectory() ? 'directory' : 'file',
				size: stat.size,
				modified: stat.mtime.toISOString(),
			};
		});

		// Sort: directories first, then files
		items.sort((a, b) => {
			if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

		return json({ 
			project: (project as { name: string }).name,
			path: dir,
			items 
		});
	} catch (error) {
		return json({ error: 'Failed to read directory' }, { status: 500 });
	}
};

const IGNORED_DIRS = new Set([
	'node_modules', '.git', '.svelte-kit', 'build', 'dist', 
	'.next', '.nuxt', '__pycache__', '.pytest_cache', 
	'.vscode', '.idea', 'coverage'
]);
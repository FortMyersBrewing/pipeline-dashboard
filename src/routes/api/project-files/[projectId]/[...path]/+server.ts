import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { getDb } from '$lib/db';

export const GET: RequestHandler = ({ params }) => {
	const { projectId, path } = params;
	
	const db = getDb();
	const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
	
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	// Resolve project path
	let basePath = (project as { repo_path: string }).repo_path;
	if (basePath.startsWith('~/')) {
		basePath = resolve(homedir(), basePath.slice(2));
	}

	const filePath = resolve(basePath, path);
	
	// Security check
	if (!filePath.startsWith(basePath)) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	if (!existsSync(filePath)) {
		return json({ error: 'File not found' }, { status: 404 });
	}

	try {
		const stat = statSync(filePath);
		if (stat.isDirectory()) {
			return json({ error: 'Path is a directory' }, { status: 400 });
		}

		// Check if file is binary
		if (isBinaryFile(path)) {
			return json({ 
				error: 'Binary file detected', 
				isBinary: true,
				size: stat.size,
				type: 'binary'
			}, { status: 415 });
		}

		const content = readFileSync(filePath, 'utf-8');
		return json({ 
			content, 
			path,
			size: stat.size,
			modified: stat.mtime.toISOString(),
			type: getFileType(path)
		});
	} catch (error) {
		return json({ error: 'Failed to read file' }, { status: 500 });
	}
};

function isBinaryFile(filename: string): boolean {
	const binaryExtensions = new Set([
		'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
		'.pdf', '.zip', '.tar', '.gz', '.bz2', '.rar',
		'.exe', '.bin', '.dll', '.so', '.dylib',
		'.mp3', '.mp4', '.avi', '.mov', '.wav',
		'.db', '.sqlite', '.sqlite3'
	]);
	
	const ext = filename.toLowerCase().split('.').pop();
	return ext ? binaryExtensions.has(`.${ext}`) : false;
}

function getFileType(filename: string): string {
	const ext = filename.toLowerCase().split('.').pop();
	const typeMap: Record<string, string> = {
		'md': 'markdown',
		'js': 'javascript',
		'ts': 'typescript',
		'svelte': 'svelte',
		'json': 'json',
		'py': 'python',
		'css': 'css',
		'html': 'html',
		'txt': 'text'
	};
	return typeMap[ext || ''] || 'text';
}
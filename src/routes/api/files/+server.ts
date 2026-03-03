import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { resolve, join, relative } from 'path';
import { homedir } from 'os';

const BASES: Record<string, string> = {
	docs: resolve(homedir(), 'projects/brewplatform'),
	memory: resolve(homedir(), '.openclaw/workspace'),
};

export const GET: RequestHandler = ({ url }) => {
	const dir = url.searchParams.get('dir') || '';
	const base = url.searchParams.get('base') || 'docs';
	const BASE_DIR = BASES[base] || BASES.docs;

	// Ensure memory directory exists
	if (base === 'memory' && !existsSync(BASE_DIR)) {
		mkdirSync(BASE_DIR, { recursive: true });
	}

	// Prevent directory traversal
	const resolved = resolve(BASE_DIR, dir);
	if (!resolved.startsWith(BASE_DIR)) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	if (!existsSync(resolved)) {
		return json({ error: 'Directory not found', dir }, { status: 404 });
	}

	try {
		const entries = readdirSync(resolved).filter(name => !name.startsWith('.')).sort();
		const items = entries.map(name => {
			const fullPath = join(resolved, name);
			try {
				const stat = statSync(fullPath);
				return {
					name,
					path: relative(BASE_DIR, fullPath),
					type: stat.isDirectory() ? 'directory' : 'file',
					size: stat.size,
					modified: stat.mtime.toISOString(),
				};
			} catch {
				return { name, path: relative(BASE_DIR, fullPath), type: 'file', size: 0, modified: '' };
			}
		});

		// Sort: directories first, then files
		items.sort((a, b) => {
			if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

		return json({ dir, base: BASE_DIR, items });
	} catch {
		return json({ error: 'Failed to read directory' }, { status: 500 });
	}
};

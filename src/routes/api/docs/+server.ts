import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const BASES: Record<string, string> = {
	docs: resolve(homedir(), 'projects/brewplatform'),
	memory: resolve(homedir(), '.openclaw/workspace'),
};

export const GET: RequestHandler = ({ url }) => {
	const filePath = url.searchParams.get('path');
	const base = url.searchParams.get('base') || 'docs';
	const BASE_DIR = BASES[base] || BASES.docs;

	if (!filePath) {
		return json({ error: 'path parameter required' }, { status: 400 });
	}

	// Prevent directory traversal
	const resolved = resolve(BASE_DIR, filePath);
	if (!resolved.startsWith(BASE_DIR)) {
		return json({ error: 'Access denied' }, { status: 403 });
	}

	if (!existsSync(resolved)) {
		return json({ error: 'File not found', path: filePath }, { status: 404 });
	}

	try {
		const content = readFileSync(resolved, 'utf-8');
		return json({ content, path: filePath });
	} catch {
		return json({ error: 'Failed to read file' }, { status: 500 });
	}
};

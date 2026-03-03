import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const BASE_DIR = resolve(homedir(), 'projects/brewplatform');

export const GET: RequestHandler = ({ url }) => {
	const filePath = url.searchParams.get('path');
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

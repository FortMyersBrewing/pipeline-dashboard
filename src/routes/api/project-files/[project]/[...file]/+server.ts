import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFileSync, existsSync, statSync, lstatSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import { getDb } from '$lib/db';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

export const GET: RequestHandler = ({ params }) => {
	const { project: projectId, file: filePath } = params;
	
	if (!projectId || !filePath) {
		return json({ error: 'Missing project or file parameter' }, { status: 400 });
	}

	// Look up project by ID from the database to get repo_path
	const db = getDb();
	const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
	
	if (!project) {
		return json({ error: 'Project not found' }, { status: 404 });
	}

	// Type-safe access to repo_path
	const repoPath = (project as Record<string, unknown>).repo_path;
	if (typeof repoPath !== 'string' || !repoPath) {
		return json({ error: 'Project has no configured repository path' }, { status: 500 });
	}

	// Resolve project base path
	let basePath = repoPath;
	if (basePath.startsWith('~/')) {
		basePath = resolve(homedir(), basePath.slice(2));
	} else {
		basePath = resolve(basePath);
	}

	// PATH TRAVERSAL PROTECTION: Use path.resolve() on the requested file path 
	// and verify it stays within the project's repo_path
	const requestedPath = resolve(basePath, filePath);
	const normalizedBasePath = resolve(basePath);
	
	if (!requestedPath.startsWith(normalizedBasePath + '/') && requestedPath !== normalizedBasePath) {
		return json({ error: 'Access denied: path traversal attempt detected' }, { status: 403 });
	}

	// Handle missing files with 404
	if (!existsSync(requestedPath)) {
		return json({ error: 'File not found' }, { status: 404 });
	}

	try {
		// Use lstatSync to detect symlinks (prevents symlink bypass of path traversal protection)
		const lstat = lstatSync(requestedPath);
		if (lstat.isSymbolicLink()) {
			return json({ error: 'Access denied: symlinks are not allowed' }, { status: 403 });
		}
		
		if (lstat.isDirectory()) {
			return json({ error: 'Path is a directory, not a file' }, { status: 400 });
		}

		const stat = lstat; // lstat gives us size too

		// BINARY detection: Check extension AND first 8KB for null bytes
		if (isBinaryFile(filePath, requestedPath)) {
			return json({ error: 'Binary file detected' }, { status: 400 });
		}

		// FILE SIZE LIMIT: 1MB max. Return truncated content with a warning header if exceeded
		const fileSize = stat.size;
		let content: string;
		let truncated = false;

		if (fileSize > MAX_FILE_SIZE) {
			// Read only the first 1MB and mark as truncated
			const buffer = Buffer.alloc(MAX_FILE_SIZE);
			const fd = require('fs').openSync(requestedPath, 'r');
			require('fs').readSync(fd, buffer, 0, MAX_FILE_SIZE, 0);
			require('fs').closeSync(fd);
			content = buffer.toString('utf-8');
			truncated = true;
		} else {
			content = readFileSync(requestedPath, 'utf-8');
		}

		// Return file content as JSON: { content: string, path: string, size: number, truncated: boolean }
		return json({
			content,
			path: filePath,
			size: fileSize,
			truncated
		});

	} catch (error) {
		console.error('Error reading file:', error);
		return json({ error: 'Failed to read file' }, { status: 500 });
	}
};

function isBinaryFile(filename: string, fullPath: string): boolean {
	// Check extension first
	const binaryExtensions = new Set([
		'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg',
		'.pdf', '.zip', '.tar', '.gz', '.bz2', '.rar', '.7z',
		'.exe', '.bin', '.dll', '.so', '.dylib', '.app',
		'.mp3', '.mp4', '.avi', '.mov', '.wav', '.flv', '.wmv',
		'.db', '.sqlite', '.sqlite3',
		'.woff', '.woff2', '.ttf', '.eot',
		'.class', '.jar', '.war'
	]);
	
	const ext = filename.toLowerCase().split('.').pop();
	if (ext && binaryExtensions.has(`.${ext}`)) {
		return true;
	}

	// Check first 8KB for null bytes
	try {
		const buffer = Buffer.alloc(8192); // 8KB
		const fd = require('fs').openSync(fullPath, 'r');
		const bytesRead = require('fs').readSync(fd, buffer, 0, 8192, 0);
		require('fs').closeSync(fd);
		
		// Look for null bytes in the read content
		for (let i = 0; i < bytesRead; i++) {
			if (buffer[i] === 0) {
				return true;
			}
		}
		
		return false;
	} catch (error) {
		// If we can't read the file to check, assume it might be binary
		return true;
	}
}
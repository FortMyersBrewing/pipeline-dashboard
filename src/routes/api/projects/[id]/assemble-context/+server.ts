import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';

export const POST: RequestHandler = async ({ params, request }) => {
	const db = getDb();
	const body = await request.json();
	const { doc_ids = [], file_paths = [] } = body;

	// Get project
	const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(params.id) as any;
	if (!project) {
		throw error(404, 'Project not found');
	}

	// Resolve project path (handle ~/... notation)
	let basePath = project.repo_path;
	if (basePath.startsWith('~/')) {
		basePath = resolve(homedir(), basePath.slice(2));
	}

	let context = '';
	const includedDocs: any[] = [];
	const includedFiles: any[] = [];

	// Add project header
	context += `# ${project.name}\n\n`;
	if (project.description) {
		context += `${project.description}\n\n`;
	}

	// Fetch and include selected documents
	if (doc_ids.length > 0) {
		const docs = db.prepare(`
			SELECT * FROM project_docs 
			WHERE id IN (${doc_ids.map(() => '?').join(',')}) AND project_id = ?
			ORDER BY created_at ASC
		`).all(...doc_ids, params.id) as any[];

		if (docs.length > 0) {
			context += '## Project Documentation\n\n';
			
			for (const doc of docs) {
				context += `### ${doc.title} (${doc.doc_type})\n\n`;
				if (doc.content) {
					context += doc.content + '\n\n';
				}
				
				includedDocs.push({
					id: doc.id,
					title: doc.title,
					type: doc.doc_type
				});
			}
		}
	}

	// Fetch and include selected files
	if (file_paths.length > 0) {
		context += '## Project Files\n\n';
		
		for (const filePath of file_paths) {
			const fullPath = resolve(basePath, filePath);
			
			// Security check
			if (!fullPath.startsWith(basePath)) {
				continue; // Skip files outside project directory
			}
			
			if (existsSync(fullPath)) {
				try {
					const stats = require('fs').statSync(fullPath);
					
					// Security: Limit file size to 1MB per file
					const MAX_FILE_SIZE = 1024 * 1024; // 1MB
					if (stats.size > MAX_FILE_SIZE) {
						console.warn(`File ${filePath} too large (${stats.size} bytes), skipping`);
						continue;
					}
					
					const content = readFileSync(fullPath, 'utf8');
					
					context += `### ${filePath}\n\n`;
					context += '```\n' + content + '\n```\n\n';
					
					includedFiles.push({
						path: filePath,
						size: stats.size
					});
				} catch (err) {
					console.error(`Failed to read file ${filePath}:`, err);
					// Continue with other files
				}
			}
		}
	}

	// Security: Limit total context size to 10MB
	const MAX_CONTEXT_SIZE = 10 * 1024 * 1024; // 10MB
	if (context.length > MAX_CONTEXT_SIZE) {
		throw error(413, `Context too large (${context.length} chars). Please select fewer files/documents.`);
	}

	// Calculate token estimate (chars / 4 is a reasonable approximation)
	const tokenEstimate = Math.ceil(context.length / 4);

	return json({
		context,
		token_estimate: tokenEstimate,
		included_docs: includedDocs,
		included_files: includedFiles
	});
};
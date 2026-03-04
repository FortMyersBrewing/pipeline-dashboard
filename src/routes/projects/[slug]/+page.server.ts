import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	
	// Get project by slug
	const project = db.prepare('SELECT * FROM projects WHERE slug = ?').get(params.slug) as any;
	if (!project) {
		throw error(404, 'Project not found');
	}
	
	// Parse tags if they exist
	if (project.tags) {
		try {
			project.tags = JSON.parse(project.tags);
		} catch (e) {
			project.tags = [];
		}
	}
	
	// Get task counts and list
	const counts = db.prepare(`
		SELECT status, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY status
	`).all(project.id) as { status: string; count: number }[];
	
	const task_counts: Record<string, number> = {};
	let total = 0;
	for (const c of counts) { 
		task_counts[c.status] = c.count; 
		total += c.count; 
	}
	
	// Get all tasks for this project
	const tasks = db.prepare(`
		SELECT * FROM tasks 
		WHERE project_id = ? 
		ORDER BY 
			CASE status
				WHEN 'queued' THEN 1
				WHEN 'in_progress' THEN 2
				WHEN 'review' THEN 3
				WHEN 'done' THEN 4
				WHEN 'failed' THEN 5
				ELSE 6
			END,
			created_at DESC
	`).all(project.id);
	
	// Get recent events (limit to 20)
	const events = db.prepare(`
		SELECT e.*, t.title as task_title FROM events e
		LEFT JOIN tasks t ON e.task_id = t.id
		WHERE e.task_id IN (
			SELECT id FROM tasks WHERE project_id = ?
		) 
		ORDER BY e.created_at DESC 
		LIMIT 20
	`).all(project.id);
	
	// Get project docs
	const docs = db.prepare(`
		SELECT * FROM project_docs 
		WHERE project_id = ? 
		ORDER BY doc_type, title
	`).all(project.id);
	
	// Get dependencies  
	const dependencies = db.prepare(`
		SELECT pd.*, p.name as depends_on_name FROM project_deps pd
		LEFT JOIN projects p ON pd.depends_on = p.id
		WHERE pd.project_id = ?
	`).all(project.id);
	
	// Try to read README.md from the repository path
	let readme: string | null = null;
	if (project.repo_path) {
		try {
			// Expand tilde and resolve path
			const repoPath = project.repo_path.startsWith('~') 
				? resolve(process.env.HOME!, project.repo_path.slice(1))
				: resolve(project.repo_path);
			const readmePath = resolve(repoPath, 'README.md');
			readme = await readFile(readmePath, 'utf-8');
		} catch (e) {
			// README doesn't exist or can't be read, that's fine
		}
	}
	
	return {
		project: {
			...project,
			task_counts,
			total_tasks: total
		},
		tasks,
		events,
		docs,
		dependencies,
		readme
	};
};
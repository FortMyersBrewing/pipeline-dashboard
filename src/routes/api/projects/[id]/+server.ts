import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	
	// Get project with new fields
	const project = db.prepare(`
		SELECT * FROM projects WHERE id = ?
	`).get(params.id) as any;
	
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
	
	// Get task counts
	const counts = db.prepare(`
		SELECT status, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY status
	`).all(params.id) as { status: string; count: number }[];
	
	const task_counts: Record<string, number> = {};
	let total = 0;
	for (const c of counts) { 
		task_counts[c.status] = c.count; 
		total += c.count; 
	}
	
	// Get recent events (limit to 20)
	const events = db.prepare(`
		SELECT * FROM events WHERE task_id IN (
			SELECT id FROM tasks WHERE project_id = ?
		) ORDER BY created_at DESC LIMIT 20
	`).all(params.id);
	
	// Get docs
	const docs = db.prepare(`
		SELECT * FROM project_docs WHERE project_id = ? ORDER BY created_at DESC
	`).all(params.id);
	
	// Get dependencies  
	const deps = db.prepare(`
		SELECT pd.*, p.name as depends_on_name FROM project_deps pd
		LEFT JOIN projects p ON pd.depends_on = p.id
		WHERE pd.project_id = ?
	`).all(params.id);
	
	return json({
		...project,
		task_counts,
		total_tasks: total,
		events,
		docs,
		dependencies: deps
	});
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const db = getDb();
	const body = await request.json();
	
	// Validate project exists
	const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(params.id);
	if (!existing) {
		throw error(404, 'Project not found');
	}
	
	// Handle tags as JSON array
	if (body.tags && Array.isArray(body.tags)) {
		body.tags = JSON.stringify(body.tags);
	}
	
	// Build update query dynamically
	const allowedFields = [
		'name', 'slug', 'description', 'stack_type', 'status', 
		'repo_path', 'repo_url', 'tags', 'default_priority', 
		'default_branch', 'github_org', 'template', 'env_notes'
	];
	
	const updates: string[] = [];
	const values: any[] = [];
	
	for (const field of allowedFields) {
		if (body[field] !== undefined) {
			updates.push(`${field} = ?`);
			values.push(body[field]);
		}
	}
	
	if (updates.length === 0) {
		return json({ error: 'No valid fields to update' }, { status: 400 });
	}
	
	// Add updated_at
	updates.push('updated_at = CURRENT_TIMESTAMP');
	values.push(params.id);
	
	const query = `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`;
	db.prepare(query).run(...values);
	
	// Return updated project
	const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(params.id) as any;
	if (updated && updated.tags) {
		try {
			updated.tags = JSON.parse(updated.tags);
		} catch (e) {
			updated.tags = [];
		}
	}
	
	return json(updated);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	
	// Validate project exists
	const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(params.id);
	if (!project) {
		throw error(404, 'Project not found');
	}
	
	// TODO: Check for unpushed commits via gh CLI
	// For now, just delete
	
	// Delete project (CASCADE will handle docs and deps)
	db.prepare('DELETE FROM projects WHERE id = ?').run(params.id);
	
	return json({ message: 'Project deleted successfully' });
};
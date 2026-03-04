import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

/**
 * GET /api/tasks/pending
 * Returns tasks that are in_progress but don't have an active agent assigned.
 * AVA polls this endpoint to auto-spawn agents for new tasks.
 */
export const GET: RequestHandler = async () => {
	const db = getDb();
	
	// Tasks in "in_progress" that haven't been picked up yet (no assignee)
	const pending = db.prepare(`
		SELECT tasks.*, projects.name as project_name, projects.slug as project_slug, 
		       projects.stack_type as project_stack_type, projects.repo_path as project_repo_path
		FROM tasks 
		LEFT JOIN projects ON tasks.project_id = projects.id
		WHERE tasks.status = 'in_progress' AND (tasks.assignee IS NULL OR tasks.assignee = '')
		ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END
	`).all();

	return json({ tasks: pending });
};

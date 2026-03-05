import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const POST: RequestHandler = async ({ params, request }) => {
	const db = getDb();
	const body = await request.json();
	const { reason } = body;

	// Get current task
	const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id) as any;
	if (!task) {
		throw error(404, 'Task not found');
	}

	// Only allow pausing active tasks
	if (!['dispatching', 'scouting', 'building', 'gating', 'reviewing', 'testing'].includes(task.status)) {
		throw error(400, 'Task cannot be paused in current status');
	}

	// Update task to paused
	db.prepare(`
		UPDATE tasks 
		SET status = 'paused', updated_at = datetime('now')
		WHERE id = ?
	`).run(params.id);

	// Log the pause action
	db.prepare(`
		INSERT INTO events (task_id, type, message, agent) 
		VALUES (?, ?, ?, ?)
	`).run(
		params.id,
		'action',
		`Task paused${reason ? ': ' + reason : ''}`,
		'user'
	);

	// Log to task actions if table exists
	try {
		db.prepare(`
			INSERT INTO task_actions (task_id, action, reason) 
			VALUES (?, ?, ?)
		`).run(params.id, 'pause', reason || null);
	} catch (err) {
		// Table might not exist yet, ignore
	}

	const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id);
	return json(updatedTask);
};
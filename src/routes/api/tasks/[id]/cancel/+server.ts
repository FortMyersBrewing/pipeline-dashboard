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

	// Only allow cancelling non-finished tasks
	if (['done', 'failed'].includes(task.status)) {
		throw error(400, 'Task cannot be cancelled in current status');
	}

	// Update task to failed with cancellation note
	db.prepare(`
		UPDATE tasks 
		SET status = 'failed', updated_at = datetime('now'), completed_at = datetime('now')
		WHERE id = ?
	`).run(params.id);

	// Log the cancellation
	db.prepare(`
		INSERT INTO events (task_id, type, message, agent) 
		VALUES (?, ?, ?, ?)
	`).run(
		params.id,
		'action',
		`Task cancelled${reason ? ': ' + reason : ''}`,
		'user'
	);

	// Log to task actions if table exists
	try {
		db.prepare(`
			INSERT INTO task_actions (task_id, action, reason) 
			VALUES (?, ?, ?)
		`).run(params.id, 'cancel', reason || null);
	} catch (err) {
		// Table might not exist yet, ignore
	}

	const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id);
	return json(updatedTask);
};
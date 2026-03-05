import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const POST: RequestHandler = async ({ params, request, fetch }) => {
	const db = getDb();
	const body = await request.json();
	const { reason, from_stage } = body;

	// Get current task
	const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id) as any;
	if (!task) {
		throw error(404, 'Task not found');
	}

	// Only allow retrying failed or paused tasks
	if (!['failed', 'paused'].includes(task.status)) {
		throw error(400, 'Task cannot be retried in current status');
	}

	// Increment attempt count if retrying from beginning, otherwise keep same attempt
	const newAttempt = from_stage ? task.attempt : task.attempt + 1;
	
	// Check max attempts
	if (newAttempt > task.max_attempts) {
		throw error(400, `Task has exceeded maximum attempts (${task.max_attempts})`);
	}

	// Reset task to queued/scout stage
	db.prepare(`
		UPDATE tasks 
		SET status = 'queued', current_stage = 'scout', attempt = ?, 
		    updated_at = datetime('now'), completed_at = NULL
		WHERE id = ?
	`).run(newAttempt, params.id);

	// Log the retry
	db.prepare(`
		INSERT INTO events (task_id, type, message, agent) 
		VALUES (?, ?, ?, ?)
	`).run(
		params.id,
		'action',
		`Task retry (attempt ${newAttempt})${reason ? ': ' + reason : ''}`,
		'user'
	);

	// Log to task actions if table exists
	try {
		db.prepare(`
			INSERT INTO task_actions (task_id, action, reason) 
			VALUES (?, ?, ?)
		`).run(params.id, 'retry', reason || null);
	} catch (err) {
		// Table might not exist yet, ignore
	}

	// Start the task again
	try {
		await fetch(`/api/tasks/${params.id}/start`, {
			method: 'POST'
		});
	} catch (err) {
		console.warn(`Failed to start retried task ${params.id}:`, err);
	}

	const updatedTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id);
	return json(updatedTask);
};
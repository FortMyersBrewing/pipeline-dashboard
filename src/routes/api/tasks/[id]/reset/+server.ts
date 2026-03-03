import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

// DELETE task and all related data
export const DELETE: RequestHandler = ({ params }) => {
	const db = getDb();
	db.prepare('DELETE FROM runs WHERE task_id = ?').run(params.id);
	db.prepare('DELETE FROM events WHERE task_id = ?').run(params.id);
	db.prepare('DELETE FROM specs WHERE task_id = ?').run(params.id);
	db.prepare('DELETE FROM tasks WHERE id = ?').run(params.id);
	return json({ deleted: params.id });
};

// POST reset — clear all runs/events and reset task to queued
export const POST: RequestHandler = ({ params }) => {
	const db = getDb();
	db.prepare('DELETE FROM runs WHERE task_id = ?').run(params.id);
	db.prepare('DELETE FROM events WHERE task_id = ?').run(params.id);
	db.prepare('DELETE FROM specs WHERE task_id = ?').run(params.id);
	db.prepare("UPDATE tasks SET status = 'queued', current_stage = NULL, attempt = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(params.id);
	const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id);
	return json(task);
};

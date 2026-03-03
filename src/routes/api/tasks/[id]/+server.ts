import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const GET: RequestHandler = ({ params }) => {
	const db = getDb();
	const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id);
	if (!task) return json({ error: 'Not found' }, { status: 404 });

	const runs = db.prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY attempt, started_at').all(params.id);
	const events = db.prepare('SELECT * FROM events WHERE task_id = ? ORDER BY created_at DESC').all(params.id);
	const specs = db.prepare('SELECT * FROM specs WHERE task_id = ? ORDER BY version DESC').all(params.id);

	return json({ ...task as object, runs, events, specs });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const db = getDb();
	const body = await request.json();
	const allowed = ['status', 'current_stage', 'attempt', 'assignee', 'completed_at'];
	const sets: string[] = [];
	const values: (string | number | null)[] = [];

	for (const key of allowed) {
		if (key in body) {
			sets.push(`${key} = ?`);
			values.push(body[key]);
		}
	}

	if (sets.length === 0) return json({ error: 'No valid fields' }, { status: 400 });

	sets.push('updated_at = CURRENT_TIMESTAMP');
	values.push(params.id);

	db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
	const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id);
	return json(task);
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const GET: RequestHandler = ({ url }) => {
	const db = getDb();
	const limit = parseInt(url.searchParams.get('limit') || '50');
	const offset = parseInt(url.searchParams.get('offset') || '0');
	const taskId = url.searchParams.get('task_id');
	const type = url.searchParams.get('type');

	let query = 'SELECT e.*, t.title as task_title FROM events e LEFT JOIN tasks t ON e.task_id = t.id WHERE 1=1';
	const params: (string | number)[] = [];

	if (taskId) { query += ' AND e.task_id = ?'; params.push(taskId); }
	if (type) { query += ' AND e.type = ?'; params.push(type); }

	query += ' ORDER BY e.created_at DESC LIMIT ? OFFSET ?';
	params.push(limit, offset);

	const events = db.prepare(query).all(...params);
	const total = db.prepare('SELECT COUNT(*) as n FROM events').get() as { n: number };

	return json({ events, total: total.n, limit, offset });
};

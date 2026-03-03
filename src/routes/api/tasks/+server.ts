import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const GET: RequestHandler = ({ url }) => {
	const db = getDb();
	const project = url.searchParams.get('project');
	const status = url.searchParams.get('status');

	let query = 'SELECT * FROM tasks WHERE 1=1';
	const params: string[] = [];

	if (project) {
		query += ' AND project_id = ?';
		params.push(project);
	}
	if (status) {
		query += ' AND status = ?';
		params.push(status);
	}
	query += " ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, created_at DESC";

	const tasks = db.prepare(query).all(...params);
	return json(tasks);
};

export const POST: RequestHandler = async ({ request }) => {
	const db = getDb();
	const body = await request.json();
	const { id, project_id, title, description, priority } = body;

	if (!id || !project_id || !title) {
		return json({ error: 'id, project_id, and title are required' }, { status: 400 });
	}

	db.prepare(`INSERT INTO tasks (id, project_id, title, description, priority) VALUES (?, ?, ?, ?, ?)`).run(
		id, project_id, title, description || null, priority || 'medium'
	);

	db.prepare(`INSERT INTO events (task_id, type, message, agent) VALUES (?, ?, ?, ?)`).run(
		id, 'note', `Task created: ${title}`, 'coordinator'
	);

	const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
	return json(task, { status: 201 });
};

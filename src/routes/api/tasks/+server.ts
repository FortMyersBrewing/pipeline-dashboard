import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const GET: RequestHandler = ({ url }) => {
	const db = getDb();
	const project = url.searchParams.get('project');
	const status = url.searchParams.get('status');

	let query = 'SELECT tasks.* FROM tasks';
	const params: string[] = [];

	if (project) {
		// Support both project ID and slug
		query += ' LEFT JOIN projects ON tasks.project_id = projects.id';
		query += ' WHERE (projects.id = ? OR projects.slug = ?)';
		params.push(project, project);
	} else {
		query += ' WHERE 1=1';
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
	const { id, project_id, project_slug, title, description, priority } = body;

	if (!id || (!project_id && !project_slug) || !title) {
		return json({ error: 'id, (project_id or project_slug), and title are required' }, { status: 400 });
	}

	// Resolve project_slug to project_id if needed
	let resolvedProjectId = project_id;
	if (!project_id && project_slug) {
		const project = db.prepare('SELECT id FROM projects WHERE slug = ?').get(project_slug) as { id: string } | undefined;
		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}
		resolvedProjectId = project.id;
	}

	db.prepare(`INSERT INTO tasks (id, project_id, title, description, priority) VALUES (?, ?, ?, ?, ?)`).run(
		id, resolvedProjectId, title, description || null, priority || 'medium'
	);

	db.prepare(`INSERT INTO events (task_id, type, message, agent) VALUES (?, ?, ?, ?)`).run(
		id, 'note', `Task created: ${title}`, 'coordinator'
	);

	const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
	return json(task, { status: 201 });
};

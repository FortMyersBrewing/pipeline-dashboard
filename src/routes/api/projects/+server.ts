import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const GET: RequestHandler = () => {
	const db = getDb();
	const projects = db.prepare('SELECT * FROM projects ORDER BY name').all();

	// Add task counts per project
	const enriched = (projects as { id: string }[]).map((p) => {
		const counts = db.prepare(`
			SELECT status, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY status
		`).all(p.id) as { status: string; count: number }[];

		const task_counts: Record<string, number> = {};
		for (const c of counts) task_counts[c.status] = c.count;
		return { ...p, task_counts };
	});

	return json(enriched);
};

export const POST: RequestHandler = async ({ request }) => {
	const db = getDb();
	const body = await request.json();
	const { id, name, slug, repo_path, repo_url, stack_type, status } = body;

	if (!id || !name || !slug || !repo_path || !stack_type) {
		return json({ error: 'id, name, slug, repo_path, and stack_type are required' }, { status: 400 });
	}

	db.prepare(`INSERT INTO projects (id, name, slug, repo_path, repo_url, stack_type, status) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
		id, name, slug, repo_path, repo_url || null, stack_type, status || 'active'
	);
	const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
	return json(project, { status: 201 });
};

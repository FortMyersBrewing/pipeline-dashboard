import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const POST: RequestHandler = async ({ params, request }) => {
	const db = getDb();
	const body = await request.json();
	const { version, content } = body;

	if (!version || !content) {
		return json({ error: 'version and content are required' }, { status: 400 });
	}

	const info = db.prepare(`INSERT INTO specs (task_id, version, content) VALUES (?, ?, ?)`).run(params.id, version, content);
	const spec = db.prepare('SELECT * FROM specs WHERE id = ?').get(info.lastInsertRowid);
	return json(spec, { status: 201 });
};

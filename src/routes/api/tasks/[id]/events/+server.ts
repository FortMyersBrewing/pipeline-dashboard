import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const POST: RequestHandler = async ({ params, request }) => {
	const db = getDb();
	const body = await request.json();
	const { type, message, agent } = body;

	if (!type || !message) {
		return json({ error: 'type and message are required' }, { status: 400 });
	}

	const info = db.prepare(`INSERT INTO events (task_id, type, message, agent) VALUES (?, ?, ?, ?)`).run(params.id, type, message, agent || null);
	const event = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
	return json(event, { status: 201 });
};

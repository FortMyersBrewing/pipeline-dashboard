import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const POST: RequestHandler = async ({ params, request }) => {
	const db = getDb();
	const body = await request.json();
	const { attempt, stage, agent, status, result, duration_ms } = body;

	if (!attempt || !stage || !status) {
		return json({ error: 'attempt, stage, and status are required' }, { status: 400 });
	}

	const stmt = db.prepare(`INSERT INTO runs (task_id, attempt, stage, agent, status, result, finished_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
	const info = stmt.run(
		params.id, attempt, stage, agent || null, status, result || null,
		status !== 'running' ? new Date().toISOString() : null,
		duration_ms || null
	);

	// Auto-create event
	const eventType = status === 'running' ? 'stage_start' : status === 'passed' ? 'stage_pass' : 'stage_fail';
	const msg = status === 'running' ? `${stage} started` : `${stage} ${status}${result ? ': ' + result.substring(0, 200) : ''}`;
	db.prepare(`INSERT INTO events (task_id, type, message, agent) VALUES (?, ?, ?, ?)`).run(params.id, eventType, msg, agent);

	const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(info.lastInsertRowid);
	return json(run, { status: 201 });
};

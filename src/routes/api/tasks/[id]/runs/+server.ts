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

	// Upsert: insert if new, update if exists (unique on task_id + attempt + stage)
	const upsertStmt = db.prepare(`
		INSERT INTO runs (task_id, attempt, stage, agent, status, result, finished_at, duration_ms)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(task_id, attempt, stage) DO UPDATE SET
			status = excluded.status,
			agent = COALESCE(excluded.agent, runs.agent),
			result = COALESCE(excluded.result, runs.result),
			finished_at = CASE WHEN excluded.status != 'running' THEN datetime('now') ELSE runs.finished_at END,
			duration_ms = COALESCE(excluded.duration_ms, runs.duration_ms)
	`);

	upsertStmt.run(
		params.id, attempt, stage, agent || null, status, result || null,
		status !== 'running' ? new Date().toISOString() : null,
		duration_ms || null
	);

	const run = db.prepare(`
		SELECT * FROM runs WHERE task_id = ? AND attempt = ? AND stage = ?
	`).get(params.id, attempt, stage);

	// Log event
	const isNew = status === 'running';
	const eventType = isNew ? 'stage_start' : (status === 'passed' ? 'stage_pass' : 'stage_fail');
	const msg = isNew ? `${stage} started` : `${stage} ${status}${result ? ': ' + result.substring(0, 200) : ''}`;
	db.prepare(`INSERT INTO events (task_id, type, message, agent) VALUES (?, ?, ?, ?)`).run(
		params.id, eventType, msg, agent
	);

	return json(run, { status: isNew ? 201 : 200 });
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const db = getDb();
	const body = await request.json();
	const { attempt, stage, status, result, duration_ms } = body;

	if (!attempt || !stage || !status) {
		return json({ error: 'attempt, stage, and status are required' }, { status: 400 });
	}

	// Find the run to update
	const existingRun = db.prepare(`
		SELECT * FROM runs 
		WHERE task_id = ? AND attempt = ? AND stage = ?
	`).get(params.id, attempt, stage) as any;

	if (!existingRun) {
		return json({ error: 'Run not found' }, { status: 404 });
	}

	// Update the run
	const updateStmt = db.prepare(`
		UPDATE runs SET 
			status = ?, 
			result = ?, 
			finished_at = ?, 
			duration_ms = ?
		WHERE id = ?
	`);
	
	updateStmt.run(
		status,
		result || null,
		status !== 'running' ? new Date().toISOString() : null,
		duration_ms || null,
		existingRun.id
	);
	
	const updatedRun = db.prepare('SELECT * FROM runs WHERE id = ?').get(existingRun.id);
	return json(updatedRun, { status: 200 });
};

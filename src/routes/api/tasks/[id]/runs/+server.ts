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

	// Check if a run already exists for this task/attempt/stage
	const existingRun = db.prepare(`
		SELECT * FROM runs 
		WHERE task_id = ? AND attempt = ? AND stage = ?
	`).get(params.id, attempt, stage) as any;

	if (existingRun) {
		// Update existing run (stage completion)
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
		
		// Create appropriate event
		const eventType = status === 'passed' ? 'stage_pass' : 'stage_fail';
		const msg = `${stage} ${status}${result ? ': ' + result.substring(0, 200) : ''}`;
		db.prepare(`INSERT INTO events (task_id, type, message, agent) VALUES (?, ?, ?, ?)`).run(
			params.id, eventType, msg, agent
		);
		
		return json(updatedRun, { status: 200 });
	} else {
		// Create new run (stage start) 
		const insertStmt = db.prepare(`
			INSERT INTO runs (task_id, attempt, stage, agent, status, result, finished_at, duration_ms) 
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`);
		
		const info = insertStmt.run(
			params.id, attempt, stage, agent || null, status, result || null,
			status !== 'running' ? new Date().toISOString() : null,
			duration_ms || null
		);

		// Create start event
		const eventType = 'stage_start';
		const msg = `${stage} started`;
		db.prepare(`INSERT INTO events (task_id, type, message, agent) VALUES (?, ?, ?, ?)`).run(
			params.id, eventType, msg, agent
		);

		const newRun = db.prepare('SELECT * FROM runs WHERE id = ?').get(info.lastInsertRowid);
		return json(newRun, { status: 201 });
	}
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

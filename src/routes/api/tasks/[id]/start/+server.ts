import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

const HOOKS_TOKEN = '3de23c23d5ae599e458a46d2583ff7191a790ed0f3f188bc';
const GATEWAY_URL = 'http://127.0.0.1:18789';

export const POST: RequestHandler = async ({ params }) => {
	const db = getDb();
	const taskId = params.id;

	// Update task to dispatching
	db.prepare(`
		UPDATE tasks 
		SET status = 'dispatching', current_stage = 'scout', attempt = 1, updated_at = datetime('now')
		WHERE id = ?
	`).run(taskId);

	const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

	// Trigger immediate heartbeat via webhook
	try {
		await fetch(`${GATEWAY_URL}/hooks/wake`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${HOOKS_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				text: `[DISPATCH] Task ${taskId} ready for pipeline`,
				mode: 'now',
			}),
		});
	} catch (err) {
		// Webhook failure shouldn't block the status change
		console.error('[start] Wake webhook failed:', err);
	}

	return new Response(JSON.stringify(task), {
		headers: { 'Content-Type': 'application/json' },
	});
};

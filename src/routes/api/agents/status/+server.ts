import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const GET: RequestHandler = () => {
	const db = getDb();

	const agents = [
		{ id: 'coordinator', name: 'Coordinator', role: 'Epic decomposition & pipeline management', model: 'Claude Opus', icon: '🧠' },
		{ id: 'scout', name: 'Scout', role: 'Writes detailed implementation specs', model: 'Claude Sonnet', icon: '🔍' },
		{ id: 'builder', name: 'Builder', role: 'Implements code from specs', model: 'Claude Code (Sonnet)', icon: '🏗️' },
		{ id: 'gatekeeper', name: 'Gatekeeper', role: 'Automated lint, type-check, tests', model: 'None (automated)', icon: '🚦' },
		{ id: 'reviewer', name: 'Reviewer', role: 'Reviews diffs against specs', model: 'Codex (GPT)', icon: '👁️' },
		{ id: 'qa', name: 'QA', role: 'Writes & runs tests', model: 'Codex (GPT)', icon: '🧪' },
	];

	// Get stats for each agent
	const enriched = agents.map((a) => {
		const total = db.prepare(`SELECT COUNT(*) as n FROM runs WHERE agent LIKE ?`).get(`%${a.id === 'gatekeeper' ? 'automated' : a.id === 'builder' || a.id === 'scout' ? 'claude' : 'codex'}%`) as { n: number };
		const passed = db.prepare(`SELECT COUNT(*) as n FROM runs WHERE agent LIKE ? AND status = 'passed'`).get(`%${a.id === 'gatekeeper' ? 'automated' : a.id === 'builder' || a.id === 'scout' ? 'claude' : 'codex'}%`) as { n: number };
		const running = db.prepare(`SELECT r.*, t.title as task_title FROM runs r JOIN tasks t ON r.task_id = t.id WHERE r.agent LIKE ? AND r.status = 'running'`).all(`%${a.id === 'gatekeeper' ? 'automated' : a.id === 'builder' || a.id === 'scout' ? 'claude' : 'codex'}%`);

		return {
			...a,
			stats: {
				total_runs: total.n,
				passed: passed.n,
				pass_rate: total.n > 0 ? Math.round((passed.n / total.n) * 100) : 0,
			},
			current_work: running.length > 0 ? running[0] : null,
			status: running.length > 0 ? 'working' : 'idle',
		};
	});

	return json(enriched);
};

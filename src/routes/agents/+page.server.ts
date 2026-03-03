import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db';

export const load: PageServerLoad = () => {
	const db = getDb();

	const agentDefs = [
		{ id: 'scout', name: 'Scout', role: 'Analyzes the codebase and writes detailed implementation specs for each task', model: 'Claude Sonnet', icon: '🔍', color: '#e05555' },
		{ id: 'builder', name: 'Builder', role: 'Implements code changes from specs, writing production-quality code', model: 'Claude Code (Sonnet)', icon: '🏗️', color: '#10b981' },
		{ id: 'gatekeeper', name: 'Gatekeeper', role: 'Runs automated lint, type-check, and test suites against changes', model: 'None (automated)', icon: '🚦', color: '#f59e0b' },
		{ id: 'reviewer', name: 'Reviewer', role: 'Reviews diffs against specs, checking for correctness and edge cases', model: 'Codex (GPT)', icon: '👁️', color: '#3b82f6' },
		{ id: 'qa', name: 'QA', role: 'Writes and runs integration and unit tests to validate changes', model: 'Codex (GPT)', icon: '🧪', color: '#a855f7' },
	];

	const agents = agentDefs.map((a) => {
		const total = db.prepare(`SELECT COUNT(*) as n FROM runs WHERE stage = ?`).get(a.id) as { n: number };
		const passed = db.prepare(`SELECT COUNT(*) as n FROM runs WHERE stage = ? AND status = 'passed'`).get(a.id) as { n: number };
		const running = db.prepare(`SELECT r.*, t.title as task_title FROM runs r JOIN tasks t ON r.task_id = t.id WHERE r.stage = ? AND r.status = 'running'`).all(a.id) as (Record<string, unknown> & { task_title: string })[];

		return {
			...a,
			total_runs: total.n,
			passed: passed.n,
			pass_rate: total.n > 0 ? Math.round((passed.n / total.n) * 100) : 0,
			current_work: running.length > 0 ? { task_title: running[0].task_title } : null,
			status: running.length > 0 ? 'working' : 'idle',
		};
	});

	return { agents };
};

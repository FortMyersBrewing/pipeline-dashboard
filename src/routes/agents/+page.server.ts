import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db';

export const load: PageServerLoad = () => {
	const db = getDb();

	const agentDefs = [
		{ id: 'coordinator', name: 'Coordinator', role: 'Epic decomposition & pipeline management', model: 'Claude Opus', icon: '🧠', match: 'coordinator' },
		{ id: 'scout', name: 'Scout', role: 'Writes detailed implementation specs', model: 'Claude Sonnet', icon: '🔍', match: 'claude-sonnet' },
		{ id: 'builder', name: 'Builder', role: 'Implements code from specs', model: 'Claude Code (Sonnet)', icon: '🏗️', match: 'claude-sonnet' },
		{ id: 'gatekeeper', name: 'Gatekeeper', role: 'Automated lint, type-check, tests', model: 'None (automated)', icon: '🚦', match: 'automated' },
		{ id: 'reviewer', name: 'Reviewer', role: 'Reviews diffs against specs', model: 'Codex (GPT)', icon: '👁️', match: 'codex' },
		{ id: 'qa', name: 'QA', role: 'Writes & runs tests', model: 'Codex (GPT)', icon: '🧪', match: 'codex' },
	];

	const agents = agentDefs.map((a) => {
		const stageMap: Record<string, string> = { scout: 'scout', builder: 'builder', gatekeeper: 'gatekeeper', reviewer: 'reviewer', qa: 'qa' };
		const stage = stageMap[a.id] || a.id;
		const total = db.prepare(`SELECT COUNT(*) as n FROM runs WHERE stage = ?`).get(stage) as { n: number };
		const passed = db.prepare(`SELECT COUNT(*) as n FROM runs WHERE stage = ? AND status = 'passed'`).get(stage) as { n: number };
		const running = db.prepare(`SELECT r.*, t.title as task_title FROM runs r JOIN tasks t ON r.task_id = t.id WHERE r.stage = ? AND r.status = 'running'`).all(stage);

		return {
			...a,
			total_runs: total.n,
			passed: passed.n,
			pass_rate: total.n > 0 ? Math.round((passed.n / total.n) * 100) : 0,
			current_work: running.length > 0 ? running[0] : null,
			status: a.id === 'coordinator' ? 'active' : running.length > 0 ? 'working' : 'idle',
		};
	});

	return { agents };
};

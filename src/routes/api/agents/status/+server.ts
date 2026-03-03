import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const GET: RequestHandler = () => {
	const db = getDb();

	// Pipeline agents (existing)
	const pipelineAgents = [
		{ id: 'coordinator', name: 'Coordinator', role: 'Epic decomposition & pipeline management', model: 'Claude Opus', icon: '🧠' },
		{ id: 'scout', name: 'Scout', role: 'Writes detailed implementation specs', model: 'Claude Sonnet', icon: '🔍' },
		{ id: 'builder', name: 'Builder', role: 'Implements code from specs', model: 'Claude Code (Sonnet)', icon: '🏗️' },
		{ id: 'gatekeeper', name: 'Gatekeeper', role: 'Automated lint, type-check, tests', model: 'None (automated)', icon: '🚦' },
		{ id: 'reviewer', name: 'Reviewer', role: 'Reviews diffs against specs', model: 'Codex (GPT)', icon: '👁️' },
		{ id: 'qa', name: 'QA', role: 'Writes & runs tests', model: 'Codex (GPT)', icon: '🧪' },
	];

	// OpenClaw agents
	const openclawAgents = [
		{ id: 'coder', name: 'Coder', role: 'Code implementation and fixes', model: 'Claude Sonnet', icon: '👨‍💻' },
		{ id: 'writer', name: 'Writer', role: 'Content and documentation', model: 'Claude Sonnet', icon: '✍️' },
		{ id: 'researcher', name: 'Researcher', role: 'Research and analysis', model: 'Claude Sonnet', icon: '🔍' },
		{ id: 'qa', name: 'QA', role: 'Testing and quality assurance', model: 'Claude Sonnet', icon: '🧪' },
		{ id: 'ops', name: 'Ops', role: 'Operations and deployment', model: 'Claude Sonnet', icon: '⚙️' },
		{ id: 'mercury', name: 'Mercury', role: 'Fast reasoning and coordination', model: 'Mercury 2', icon: '⚡' },
	];

	// Get stats for pipeline agents
	const enrichedPipeline = pipelineAgents.map((a) => {
		const total = db.prepare(`SELECT COUNT(*) as n FROM runs WHERE agent LIKE ?`).get(`%${a.id === 'gatekeeper' ? 'automated' : a.id === 'builder' || a.id === 'scout' ? 'claude' : 'codex'}%`) as { n: number };
		const passed = db.prepare(`SELECT COUNT(*) as n FROM runs WHERE agent LIKE ? AND status = 'passed'`).get(`%${a.id === 'gatekeeper' ? 'automated' : a.id === 'builder' || a.id === 'scout' ? 'claude' : 'codex'}%`) as { n: number };
		const running = db.prepare(`SELECT r.*, t.title as task_title FROM runs r JOIN tasks t ON r.task_id = t.id WHERE r.agent LIKE ? AND r.status = 'running'`).all(`%${a.id === 'gatekeeper' ? 'automated' : a.id === 'builder' || a.id === 'scout' ? 'claude' : 'codex'}%`);

		return {
			...a,
			type: 'pipeline',
			stats: {
				total_runs: total.n,
				passed: passed.n,
				pass_rate: total.n > 0 ? Math.round((passed.n / total.n) * 100) : 0,
			},
			current_work: running.length > 0 ? running[0] : null,
			status: running.length > 0 ? 'working' : 'idle',
		};
	});

	// Get real-time status for OpenClaw agents
	const enrichedOpenClaw = openclawAgents.map((a) => {
		const statusRow = db.prepare(`SELECT status, current_task, last_updated FROM agent_status WHERE agent_id = ?`).get(a.id) as { status: string; current_task: string | null; last_updated: string } | undefined;
		
		return {
			...a,
			type: 'openclaw',
			stats: {
				total_runs: 0, // TODO: Could track sub-agent spawns in the future
				passed: 0,
				pass_rate: 0,
			},
			current_work: statusRow?.current_task ? { task_title: statusRow.current_task } : null,
			status: statusRow?.status || 'idle',
			last_updated: statusRow?.last_updated,
		};
	});

	const allAgents = [...enrichedPipeline, ...enrichedOpenClaw];

	return json(allAgents);
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { agentId, status, task, timestamp } = body;
		
		if (!agentId || !status) {
			return json({ error: 'Missing required fields: agentId, status' }, { status: 400 });
		}
		
		const db = getDb();
		const stmt = db.prepare(`
			INSERT OR REPLACE INTO agent_status (agent_id, status, current_task, last_updated)
			VALUES (?, ?, ?, ?)
		`);
		
		stmt.run(agentId, status, task || null, timestamp || new Date().toISOString());
		
		return json({ success: true });
	} catch (error) {
		console.error('Error updating agent status:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

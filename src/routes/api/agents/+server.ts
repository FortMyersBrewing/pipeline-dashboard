import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export interface Agent {
	id: string;
	name: string;
	role: string;
	model: string;
	modelAbbrev: string;
	icon: string;
	color: string;
	status: 'idle' | 'working' | 'offline';
	lastActivity: string;
}

// Real OpenClaw agents config
const agents: Agent[] = [
	{
		id: 'main',
		name: 'Coordinator',
		role: 'Always available, delegates work',
		model: 'anthropic/claude-opus-4-6',
		modelAbbrev: 'Opus 4',
		icon: '🎯',
		color: '#8B5CF6',
		status: 'idle',
		lastActivity: 'No recent activity'
	},
	{
		id: 'coder',
		name: 'Builder',
		role: 'Writes code, implements specs',
		model: 'anthropic/claude-sonnet-4-20250514',
		modelAbbrev: 'Sonnet 4',
		icon: '🏗️',
		color: '#10b981',
		status: 'idle',
		lastActivity: 'No recent activity'
	},
	{
		id: 'researcher',
		name: 'Researcher',
		role: 'Web research, analysis',
		model: 'anthropic/claude-sonnet-4-20250514',
		modelAbbrev: 'Sonnet 4',
		icon: '🔍',
		color: '#3b82f6',
		status: 'idle',
		lastActivity: 'No recent activity'
	},
	{
		id: 'qa',
		name: 'QA Tester',
		role: 'Runs tests, verifies behavior',
		model: 'anthropic/claude-sonnet-4-20250514',
		modelAbbrev: 'Sonnet 4',
		icon: '🧪',
		color: '#a855f7',
		status: 'idle',
		lastActivity: 'No recent activity'
	},
	{
		id: 'ops',
		name: 'Operations',
		role: 'Infrastructure, deployments',
		model: 'anthropic/claude-sonnet-4-20250514',
		modelAbbrev: 'Sonnet 4',
		icon: '⚙️',
		color: '#f59e0b',
		status: 'idle',
		lastActivity: 'No recent activity'
	},
	{
		id: 'writer',
		name: 'Writer',
		role: 'Documentation, specs, reports',
		model: 'anthropic/claude-sonnet-4-20250514',
		modelAbbrev: 'Sonnet 4',
		icon: '📝',
		color: '#06b6d4',
		status: 'idle',
		lastActivity: 'No recent activity'
	},
	{
		id: 'mercury',
		name: 'Mercury',
		role: 'Fast inference, gems extraction',
		model: 'inception/mercury-2',
		modelAbbrev: 'Mercury 2',
		icon: '⚡',
		color: '#ef4444',
		status: 'idle',
		lastActivity: 'No recent activity'
	}
];

export const GET: RequestHandler = async () => {
	// Read real-time status from agent_status table
	try {
		const statuses = getDb().prepare('SELECT agent_id, status, current_task, last_updated FROM agent_status').all() as Array<{agent_id: string, status: string, current_task: string | null, last_updated: string | null}>;
		const statusMap = new Map(statuses.map(s => [s.agent_id, s]));
		
		const enriched = agents.map(a => {
			const live = statusMap.get(a.id);
			return {
				...a,
				status: live?.status || a.status,
				lastActivity: live?.current_task || a.lastActivity,
				lastUpdated: live?.last_updated || null
			};
		});
		
		return json({ agents: enriched });
	} catch (e) {
		console.error('Agent status DB error:', e);
		return json({ agents });
	}
};
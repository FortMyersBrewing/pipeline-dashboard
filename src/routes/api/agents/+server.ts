import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';
import { getAgentStatuses } from '$lib/openclaw-api';

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
	currentTask?: string;
	runtime?: string;
	totalTokens?: number;
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
	// Get live agent statuses from OpenClaw gateway
	try {
		const { statuses: liveStatuses, recentlyCompleted } = await getAgentStatuses();
		const statusMap = new Map(liveStatuses.map(s => [s.agentId, s]));

		// Auto-complete tasks whose agents have finished
		const db = getDb();
		const inProgressTasks = db.prepare(
			"SELECT id, assignee FROM tasks WHERE status = 'in_progress'"
		).all() as Array<{id: string, assignee: string | null}>;

		for (const task of inProgressTasks) {
			// Check if a recently completed agent matches this task's label pattern
			const matchingCompleted = recentlyCompleted.find(c => 
				c.label === `${task.id}-builder` || c.label === task.id
			);
			if (matchingCompleted) {
				const now = new Date().toISOString();
				db.prepare(
					"UPDATE tasks SET status = 'done', current_stage = 'complete', completed_at = ? WHERE id = ?"
				).run(now, task.id);
				// Update any running run records
				db.prepare(
					"UPDATE runs SET status = 'passed', finished_at = ?, duration_ms = ? WHERE task_id = ? AND status = 'running'"
				).run(now, matchingCompleted.runtimeMs, task.id);
			}
		}
		
		const enriched = agents.map(agent => {
			const live = statusMap.get(agent.id);
			
			if (live) {
				// Agent has live data from OpenClaw
				return {
					...agent,
					status: live.status,
					currentTask: live.task,
					runtime: live.runtime,
					totalTokens: live.totalTokens,
					lastActivity: live.status === 'working' 
						? `Working: ${live.task}` 
						: live.lastCompletedTask 
							? `Last: ${live.lastCompletedTask} (${live.lastCompletedRuntime})`
							: 'No recent activity'
				};
			} else {
				// Agent not found in OpenClaw - use static data
				return {
					...agent,
					status: 'idle' as const,
					lastActivity: 'No recent activity'
				};
			}
		});
		
		return json({ agents: enriched });
	} catch (error) {
		console.error('Failed to fetch OpenClaw agent statuses:', error);
		// Fall back to static data if OpenClaw is unavailable
		return json({ agents });
	}
};
interface SubagentEntry {
	label: string;
	sessionKey: string;
	status: 'running' | 'done';
	task: string;
	runtime: string;
	runtimeMs?: number;
	model: string;
	totalTokens?: number;
	startedAt?: number;
	endedAt?: number;
}

interface SubagentsResponse {
	result: {
		details: {
			active: SubagentEntry[];
			recent: SubagentEntry[];
		};
	};
}

export interface AgentStatus {
	agentId: string;
	status: 'working' | 'idle';
	task?: string;
	label?: string;
	runtime?: string;
	runtimeMs?: number;
	totalTokens?: number;
	lastCompletedTask?: string;
	lastCompletedLabel?: string;
	lastCompletedRuntime?: string;
}

export interface CompletedAgent {
	label: string;
	agentId: string;
	runtimeMs: number;
	totalTokens: number;
}

// TODO: Move to environment variable OPENCLAW_GATEWAY_TOKEN
const GATEWAY_TOKEN = 'b2987b6d9e5d6eb85823110daab019ca86f0b02eda5cbeb0';
const GATEWAY_URL = 'http://localhost:18789';

/**
 * Extract agent ID from OpenClaw session key
 * Format: "agent:<agentId>:subagent:<uuid>"
 */
function extractAgentId(sessionKey: string): string | null {
	const match = sessionKey.match(/^agent:([^:]+):subagent:/);
	return match ? match[1] : null;
}

/**
 * Call the OpenClaw gateway to get current subagent statuses
 */
export async function getAgentStatuses(): Promise<{ statuses: AgentStatus[], activeLabels: string[], recentlyCompleted: CompletedAgent[] }> {
	try {
		const response = await fetch(`${GATEWAY_URL}/tools/invoke`, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${GATEWAY_TOKEN}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				tool: 'subagents',
				args: {
					action: 'list',
					recentMinutes: 30
				}
			}),
			signal: AbortSignal.timeout(3000) // 3s timeout
		});

		if (!response.ok) {
			console.warn('OpenClaw gateway request failed:', response.status, response.statusText);
			return { statuses: [], activeLabels: [], recentlyCompleted: [] };
		}

		const data: SubagentsResponse = await response.json();
		const { active, recent } = data.result.details;

		// Track active labels for task matching
		const activeLabels = new Set<string>();

		// Process active agents
		const activeMap = new Map<string, AgentStatus>();
		for (const entry of active) {
			const agentId = extractAgentId(entry.sessionKey);
			if (agentId) {
				activeLabels.add(entry.label);
				activeMap.set(agentId, {
					agentId,
					status: 'working',
					task: entry.task,
					label: entry.label,
					runtime: entry.runtime,
					runtimeMs: entry.runtimeMs,
					totalTokens: entry.totalTokens
				});
			}
		}

		// Process recent completed agents (for idle agents and task completion)
		const recentMap = new Map<string, Pick<AgentStatus, 'lastCompletedTask' | 'lastCompletedRuntime' | 'lastCompletedLabel'>>();
		const recentlyCompleted: CompletedAgent[] = [];
		for (const entry of recent) {
			const agentId = extractAgentId(entry.sessionKey);
			if (agentId) {
				if (!activeMap.has(agentId) && !recentMap.has(agentId)) {
					recentMap.set(agentId, {
						lastCompletedTask: entry.task,
						lastCompletedLabel: entry.label,
						lastCompletedRuntime: entry.runtime
					});
				}
				// Track ALL recently completed for task auto-completion
				if (entry.status === 'done' && !activeLabels.has(entry.label)) {
					recentlyCompleted.push({
						label: entry.label,
						agentId,
						runtimeMs: entry.runtimeMs || 0,
						totalTokens: entry.totalTokens || 0
					});
				}
			}
		}

		// Combine active and recent data
		const statuses: AgentStatus[] = [];
		
		// Add active agents
		for (const status of activeMap.values()) {
			statuses.push(status);
		}

		// Add idle agents that have recent activity
		for (const [agentId, recentData] of recentMap) {
			statuses.push({
				agentId,
				status: 'idle',
				...recentData
			});
		}

		return { statuses, activeLabels: [...activeLabels], recentlyCompleted };

	} catch (error) {
		console.warn('Failed to fetch OpenClaw agent statuses:', error);
		return { statuses: [], activeLabels: [], recentlyCompleted: [] };
	}
}
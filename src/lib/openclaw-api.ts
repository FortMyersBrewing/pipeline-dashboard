interface SubagentEntry {
	label: string;
	sessionKey: string;
	status: 'running' | 'done';
	task: string;
	runtime: string;
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
	runtime?: string;
	totalTokens?: number;
	lastCompletedTask?: string;
	lastCompletedRuntime?: string;
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
export async function getAgentStatuses(): Promise<AgentStatus[]> {
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
			return [];
		}

		const data: SubagentsResponse = await response.json();
		const { active, recent } = data.result.details;

		// Process active agents
		const activeMap = new Map<string, AgentStatus>();
		for (const entry of active) {
			const agentId = extractAgentId(entry.sessionKey);
			if (agentId) {
				activeMap.set(agentId, {
					agentId,
					status: 'working',
					task: entry.task,
					runtime: entry.runtime,
					totalTokens: entry.totalTokens
				});
			}
		}

		// Process recent completed agents (for idle agents)
		const recentMap = new Map<string, Pick<AgentStatus, 'lastCompletedTask' | 'lastCompletedRuntime'>>();
		for (const entry of recent) {
			const agentId = extractAgentId(entry.sessionKey);
			if (agentId && !activeMap.has(agentId)) {
				// Only track recent if not currently active
				recentMap.set(agentId, {
					lastCompletedTask: entry.task,
					lastCompletedRuntime: entry.runtime
				});
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

		return statuses;

	} catch (error) {
		console.warn('Failed to fetch OpenClaw agent statuses:', error);
		return [];
	}
}
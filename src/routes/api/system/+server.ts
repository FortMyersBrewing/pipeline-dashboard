import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const GET: RequestHandler = () => {
	const db = getDb();
	const uptime = process.uptime();

	// DB stats
	const taskCount = db.prepare('SELECT COUNT(*) as n FROM tasks').get() as { n: number };
	const eventCount = db.prepare('SELECT COUNT(*) as n FROM events').get() as { n: number };
	const runCount = db.prepare('SELECT COUNT(*) as n FROM runs').get() as { n: number };
	const activeRuns = db.prepare("SELECT COUNT(*) as n FROM runs WHERE status = 'running'").get() as { n: number };

	// Check services
	const services = [
		{
			name: 'OpenClaw Gateway',
			status: 'operational',
			description: 'API gateway and task router',
			uptime: Math.floor(uptime),
		},
		{
			name: 'SQLite Database',
			status: 'operational',
			description: 'Local persistence layer (WAL mode)',
			details: `${taskCount.n} tasks, ${eventCount.n} events, ${runCount.n} runs`,
		},
		{
			name: 'SSE Log Stream',
			status: 'operational',
			description: 'Real-time log streaming via Server-Sent Events',
		},
		{
			name: 'Agent Orchestrator',
			status: activeRuns.n > 0 ? 'active' : 'idle',
			description: 'Pipeline stage execution coordinator',
			details: activeRuns.n > 0 ? `${activeRuns.n} active run(s)` : 'No active runs',
		},
	];

	// Node info
	let nodeVersion = process.version;
	let platform = process.platform;
	let memUsage = process.memoryUsage();

	return json({
		uptime: Math.floor(uptime),
		node_version: nodeVersion,
		platform,
		memory: {
			rss_mb: Math.round(memUsage.rss / 1024 / 1024),
			heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
			heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
		},
		services,
		db_stats: {
			tasks: taskCount.n,
			events: eventCount.n,
			runs: runCount.n,
			active_runs: activeRuns.n,
		},
	});
};

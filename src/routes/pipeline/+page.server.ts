import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db';

export const load: PageServerLoad = () => {
	const db = getDb();

	const runs = db.prepare(`
		SELECT r.*, t.title as task_title, t.priority
		FROM runs r
		JOIN tasks t ON r.task_id = t.id
		ORDER BY r.started_at DESC
		LIMIT 100
	`).all();

	const events = db.prepare(`
		SELECT e.*, t.title as task_title
		FROM events e
		LEFT JOIN tasks t ON e.task_id = t.id
		ORDER BY e.created_at DESC
		LIMIT 50
	`).all();

	// Pipeline stats
	const totalRuns = db.prepare('SELECT COUNT(*) as n FROM runs').get() as { n: number };
	const passedRuns = db.prepare("SELECT COUNT(*) as n FROM runs WHERE status = 'passed'").get() as { n: number };
	const failedRuns = db.prepare("SELECT COUNT(*) as n FROM runs WHERE status = 'failed'").get() as { n: number };
	const activeRuns = db.prepare("SELECT COUNT(*) as n FROM runs WHERE status = 'running'").get() as { n: number };

	return {
		runs,
		events,
		stats: {
			total: totalRuns.n,
			passed: passedRuns.n,
			failed: failedRuns.n,
			active: activeRuns.n,
			passRate: totalRuns.n > 0 ? Math.round((passedRuns.n / totalRuns.n) * 100) : 0,
		},
	};
};

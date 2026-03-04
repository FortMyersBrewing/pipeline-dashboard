import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db';
import type { Task, Run, PipelineEvent, Project } from '$lib/types';

export const load: PageServerLoad = () => {
	const db = getDb();
	const tasks = db.prepare(`
		SELECT tasks.*, projects.name as project_name, projects.slug as project_slug, projects.stack_type as project_stack_type 
		FROM tasks 
		LEFT JOIN projects ON tasks.project_id = projects.id
		ORDER BY 
			CASE 
				WHEN tasks.status IN ('done', 'failed', 'paused') THEN 
					COALESCE(tasks.completed_at, tasks.updated_at)
				ELSE 
					(CASE tasks.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END) || '-' || tasks.updated_at
			END DESC
	`).all() as Task[];

	const enriched = tasks.map((t) => {
		const runs = db.prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY attempt, started_at').all(t.id) as Run[];
		const events = db.prepare('SELECT * FROM events WHERE task_id = ? ORDER BY created_at DESC LIMIT 5').all(t.id) as PipelineEvent[];
		return { ...t, runs, events };
	});

	const projects = db.prepare('SELECT * FROM projects ORDER BY name').all() as Project[];

	const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
	const thisWeek = db.prepare("SELECT COUNT(*) as n FROM tasks WHERE created_at >= ?").get(weekAgo) as { n: number };
	const inProgressCount = db.prepare("SELECT COUNT(*) as n FROM tasks WHERE status NOT IN ('queued', 'done', 'failed', 'paused')").get() as { n: number };
	const totalCount = db.prepare("SELECT COUNT(*) as n FROM tasks").get() as { n: number };
	const doneCount = db.prepare("SELECT COUNT(*) as n FROM tasks WHERE status = 'done'").get() as { n: number };
	const completion = totalCount.n > 0 ? Math.round((doneCount.n / totalCount.n) * 100) : 0;

	return {
		tasks: enriched,
		projects,
		stats: {
			thisWeek: thisWeek.n,
			inProgress: inProgressCount.n,
			total: totalCount.n,
			completion,
		},
	};
};

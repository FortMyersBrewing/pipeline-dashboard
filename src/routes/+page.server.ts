import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db';
import type { Task, Run, PipelineEvent } from '$lib/types';

export const load: PageServerLoad = () => {
	const db = getDb();
	const tasks = db.prepare("SELECT * FROM tasks ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, updated_at DESC").all() as Task[];

	// Get runs for each task
	const enriched = tasks.map((t) => {
		const runs = db.prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY attempt, started_at').all(t.id) as Run[];
		const events = db.prepare('SELECT * FROM events WHERE task_id = ? ORDER BY created_at DESC LIMIT 5').all(t.id) as PipelineEvent[];
		return { ...t, runs, events };
	});

	return { tasks: enriched };
};

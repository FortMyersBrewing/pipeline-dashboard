import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db';
import type { Project } from '$lib/types';

export const load: PageServerLoad = () => {
	const db = getDb();
	const projects = db.prepare('SELECT * FROM projects ORDER BY name').all() as any[];

	const enriched = projects.map((p) => {
		const counts = db.prepare(`SELECT status, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY status`).all(p.id) as { status: string; count: number }[];
		const task_counts: Record<string, number> = {};
		let total = 0;
		for (const c of counts) { task_counts[c.status] = c.count; total += c.count; }
		
		// Parse tags if they exist
		if (p.tags) {
			try {
				p.tags = JSON.parse(p.tags);
			} catch (e) {
				p.tags = [];
			}
		}
		
		return { ...p, task_counts, total_tasks: total };
	});

	return { projects: enriched };
};

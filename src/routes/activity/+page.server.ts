import type { PageServerLoad } from './$types';
import { getDb } from '$lib/db';

export const load: PageServerLoad = () => {
	const db = getDb();
	const events = db.prepare(`
		SELECT e.*, t.title as task_title 
		FROM events e 
		LEFT JOIN tasks t ON e.task_id = t.id 
		ORDER BY e.created_at DESC 
		LIMIT 100
	`).all();

	return { events };
};

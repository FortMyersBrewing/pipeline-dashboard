import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const GET: RequestHandler = () => {
	const db = getDb();
	const projects = db.prepare('SELECT * FROM projects ORDER BY name').all();

	// Add task counts per project and parse tags
	const enriched = (projects as any[]).map((p) => {
		const counts = db.prepare(`
			SELECT status, COUNT(*) as count FROM tasks WHERE project_id = ? GROUP BY status
		`).all(p.id) as { status: string; count: number }[];

		const task_counts: Record<string, number> = {};
		let total = 0;
		for (const c of counts) { 
			task_counts[c.status] = c.count; 
			total += c.count;
		}
		
		// Parse tags JSON
		if (p.tags) {
			try {
				p.tags = JSON.parse(p.tags);
			} catch (e) {
				p.tags = [];
			}
		}
		
		return { ...p, task_counts, total_tasks: total };
	});

	return json(enriched);
};

export const POST: RequestHandler = async ({ request }) => {
	const db = getDb();
	const body = await request.json();
	
	if (!body.name || !body.stack_type) {
		return json({ error: 'name and stack_type are required' }, { status: 400 });
	}

	// Generate ID and slug if not provided
	const id = body.id || crypto.randomUUID();
	const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	
	// Check slug uniqueness
	const existing = db.prepare('SELECT id FROM projects WHERE slug = ?').get(slug);
	if (existing) {
		return json({ error: `Project with slug '${slug}' already exists` }, { status: 400 });
	}
	
	// Handle tags as JSON
	const tags = body.tags ? JSON.stringify(body.tags) : null;
	
	// TODO: Handle GitHub actions (import, create, link)
	// For now, use provided repo info or defaults
	const repo_path = body.repo_path || `~/projects/${slug}`;
	
	const project = {
		id,
		name: body.name,
		slug,
		repo_path,
		repo_url: body.repo_url || null,
		stack_type: body.stack_type,
		status: body.status || 'active',
		description: body.description || null,
		tags,
		default_priority: body.default_priority || 'medium',
		default_branch: body.default_branch || 'main',
		github_org: body.github_org || null,
		template: body.template || null,
		env_notes: body.env_notes || null
	};

	db.prepare(`
		INSERT INTO projects (
			id, name, slug, repo_path, repo_url, stack_type, status,
			description, tags, default_priority, default_branch, 
			github_org, template, env_notes
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		project.id, project.name, project.slug, project.repo_path, project.repo_url,
		project.stack_type, project.status, project.description, project.tags,
		project.default_priority, project.default_branch, project.github_org,
		project.template, project.env_notes
	);
	
	const created = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
	if (created && created.tags) {
		try {
			created.tags = JSON.parse(created.tags);
		} catch (e) {
			created.tags = [];
		}
	}
	
	return json(created, { status: 201 });
};

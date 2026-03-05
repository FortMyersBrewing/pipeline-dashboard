import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const GET: RequestHandler = async ({ params }) => {
	const projectId = params.id;
	
	try {
		const db = getDb();
		
		// Check if project exists
		const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}
		
		// Get dependencies (projects this project depends on)
		const dependsOn = db.prepare(`
			SELECT 
				pd.id as dep_id,
				pd.note,
				pd.created_at,
				p.id as project_id,
				p.name as project_name,
				p.slug as project_slug,
				p.stack_type
			FROM project_deps pd
			JOIN projects p ON pd.depends_on = p.id
			WHERE pd.project_id = ?
			ORDER BY pd.created_at DESC
		`).all(projectId);
		
		// Get dependents (projects that depend on this project)
		const dependedBy = db.prepare(`
			SELECT 
				pd.id as dep_id,
				pd.note,
				pd.created_at,
				p.id as project_id,
				p.name as project_name,
				p.slug as project_slug,
				p.stack_type
			FROM project_deps pd
			JOIN projects p ON pd.project_id = p.id
			WHERE pd.depends_on = ?
			ORDER BY pd.created_at DESC
		`).all(projectId);
		
		return json({
			project_id: projectId,
			depends_on: dependsOn,
			depended_by: dependedBy,
			total_dependencies: dependsOn.length,
			total_dependents: dependedBy.length
		});
		
	} catch (error) {
		console.error('Failed to fetch project dependencies:', error);
		return json({ 
			error: 'Failed to fetch project dependencies' 
		}, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, params }) => {
	const projectId = params.id;
	const body = await request.json();
	const { depends_on, note } = body;
	
	if (!depends_on) {
		return json({ error: 'depends_on project ID is required' }, { status: 400 });
	}
	
	if (depends_on === projectId) {
		return json({ error: 'A project cannot depend on itself' }, { status: 400 });
	}
	
	try {
		const db = getDb();
		
		// Check if both projects exist
		const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}
		
		const dependencyProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(depends_on);
		if (!dependencyProject) {
			return json({ error: 'Dependency project not found' }, { status: 404 });
		}
		
		// Check if dependency already exists
		const existing = db.prepare(
			'SELECT * FROM project_deps WHERE project_id = ? AND depends_on = ?'
		).get(projectId, depends_on);
		
		if (existing) {
			return json({ error: 'Dependency relationship already exists' }, { status: 409 });
		}
		
		// Check for circular dependencies
		const wouldCreateCycle = checkCircularDependency(db, depends_on, projectId);
		if (wouldCreateCycle) {
			return json({ 
				error: 'Cannot create dependency: would create a circular dependency' 
			}, { status: 400 });
		}
		
		// Create the dependency
		const result = db.prepare(`
			INSERT INTO project_deps (project_id, depends_on, note)
			VALUES (?, ?, ?)
		`).run(projectId, depends_on, note || null);
		
		// Get the created dependency with project details
		const createdDep = db.prepare(`
			SELECT 
				pd.id as dep_id,
				pd.note,
				pd.created_at,
				p.id as project_id,
				p.name as project_name,
				p.slug as project_slug,
				p.stack_type
			FROM project_deps pd
			JOIN projects p ON pd.depends_on = p.id
			WHERE pd.id = ?
		`).get(result.lastInsertRowid);
		
		return json({
			success: true,
			dependency: createdDep
		}, { status: 201 });
		
	} catch (error) {
		console.error('Failed to create project dependency:', error);
		return json({ 
			error: 'Failed to create project dependency' 
		}, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params, url }) => {
	const projectId = params.id;
	const depId = url.searchParams.get('dep_id');
	
	if (!depId) {
		return json({ error: 'dep_id parameter is required' }, { status: 400 });
	}
	
	try {
		const db = getDb();
		
		// Check if the dependency exists and belongs to this project
		const dependency = db.prepare(`
			SELECT * FROM project_deps 
			WHERE id = ? AND project_id = ?
		`).get(depId, projectId);
		
		if (!dependency) {
			return json({ error: 'Dependency not found' }, { status: 404 });
		}
		
		// Delete the dependency
		const result = db.prepare('DELETE FROM project_deps WHERE id = ?').run(depId);
		
		if (result.changes === 0) {
			return json({ error: 'Failed to delete dependency' }, { status: 500 });
		}
		
		return json({
			success: true,
			deleted_dep_id: parseInt(depId)
		});
		
	} catch (error) {
		console.error('Failed to delete project dependency:', error);
		return json({ 
			error: 'Failed to delete project dependency' 
		}, { status: 500 });
	}
};

// Helper function to check for circular dependencies
function checkCircularDependency(db: any, startProjectId: string, targetProjectId: string): boolean {
	const visited = new Set<string>();
	const recursionStack = new Set<string>();
	
	function hasCycle(currentId: string): boolean {
		if (recursionStack.has(currentId)) {
			return true; // Found a cycle
		}
		
		if (visited.has(currentId)) {
			return false; // Already processed this node
		}
		
		visited.add(currentId);
		recursionStack.add(currentId);
		
		// Get all dependencies of current project
		const deps = db.prepare(
			'SELECT depends_on FROM project_deps WHERE project_id = ?'
		).all(currentId);
		
		for (const dep of deps) {
			if (dep.depends_on === targetProjectId) {
				return true; // Direct cycle found
			}
			
			if (hasCycle(dep.depends_on)) {
				return true; // Indirect cycle found
			}
		}
		
		recursionStack.delete(currentId);
		return false;
	}
	
	return hasCycle(startProjectId);
}
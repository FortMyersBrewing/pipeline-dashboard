import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';
import { randomUUID } from 'crypto';

interface LaunchRequest {
	tasks: {
		title: string;
		description: string;
		priority?: string;
	}[];
	context: {
		doc_ids: number[];
		file_paths: string[];
	};
	config: {
		max_attempts?: number;
		branch_strategy?: string;
		custom_branch?: string;
	};
}

export const POST: RequestHandler = async ({ params, request, fetch }) => {
	const db = getDb();
	const body: LaunchRequest = await request.json();

	// Validate project exists
	const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(params.id) as any;
	if (!project) {
		throw error(404, 'Project not found');
	}

	const { tasks, context, config } = body;
	if (!tasks || tasks.length === 0) {
		throw error(400, 'At least one task is required');
	}

	// Input validation
	if (tasks.length > 10) {
		throw error(400, 'Maximum 10 tasks allowed per launch');
	}
	
	for (const task of tasks) {
		if (!task.title || task.title.trim().length === 0) {
			throw error(400, 'Task title is required');
		}
		if (task.title.length > 255) {
			throw error(400, 'Task title too long (max 255 characters)');
		}
		if (task.description && task.description.length > 10000) {
			throw error(400, 'Task description too long (max 10,000 characters)');
		}
	}

	// Assemble context if any docs or files are selected
	let bundledContext = '';
	if (context.doc_ids.length > 0 || context.file_paths.length > 0) {
		try {
			const contextResponse = await fetch(`/api/projects/${params.id}/assemble-context`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(context)
			});

			if (contextResponse.ok) {
				const contextData = await contextResponse.json();
				bundledContext = contextData.context;
			}
		} catch (err) {
			console.warn('Failed to assemble context:', err);
			// Continue without context rather than failing
		}
	}

	const createdTasks: any[] = [];

	// Create each task
	for (const task of tasks) {
		const taskId = randomUUID();
		
		// Combine user description with bundled context
		let finalDescription = task.description;
		if (bundledContext) {
			finalDescription += '\n\n## Context\n\n' + bundledContext;
		}

		// Insert task
		db.prepare(`
			INSERT INTO tasks (
				id, project_id, title, description, priority, max_attempts,
				bundled_context, context_docs, context_files, branch_strategy,
				status, current_stage, attempt
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'scout', 1)
		`).run(
			taskId,
			params.id,
			task.title,
			finalDescription,
			task.priority || 'medium',
			config.max_attempts || 3,
			bundledContext || null,
			JSON.stringify(context.doc_ids),
			JSON.stringify(context.file_paths),
			config.branch_strategy === 'custom' ? config.custom_branch : config.branch_strategy || 'main'
		);

		// Log creation event
		db.prepare(`
			INSERT INTO events (task_id, type, message, agent) 
			VALUES (?, ?, ?, ?)
		`).run(
			taskId,
			'note',
			`Task created via Pipeline Launch Wizard: ${task.title}`,
			'coordinator'
		);

		// Start the task (this will set status to dispatching and fire webhook)
		try {
			const startResponse = await fetch(`/api/tasks/${taskId}/start`, {
				method: 'POST'
			});
			
			if (!startResponse.ok) {
				console.warn(`Failed to start task ${taskId}`);
			}
		} catch (err) {
			console.warn(`Failed to start task ${taskId}:`, err);
		}

		// Get the created task for response
		const createdTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
		createdTasks.push(createdTask);
	}

	return json({ 
		success: true, 
		tasks: createdTasks,
		message: `Successfully launched ${createdTasks.length} task(s)`
	});
};
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	
	// Get specific document
	const doc = db.prepare(`
		SELECT * FROM project_docs 
		WHERE id = ? AND project_id = ?
	`).get(params.docId, params.id);
	
	if (!doc) {
		throw error(404, 'Document not found');
	}
	
	return json(doc);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const db = getDb();
	const body = await request.json();
	
	// Get existing document
	const existing = db.prepare(`
		SELECT * FROM project_docs 
		WHERE id = ? AND project_id = ?
	`).get(params.docId, params.id) as any;
	
	if (!existing) {
		throw error(404, 'Document not found');
	}
	
	// Save current version to history before updating
	if (existing.content) {
		db.prepare(`
			INSERT INTO doc_versions (doc_id, version, content, changed_by)
			VALUES (?, ?, ?, ?)
		`).run(existing.id, existing.version, existing.content, body.changed_by || null);
	}
	
	// Update document with new content
	const newVersion = existing.version + 1;
	db.prepare(`
		UPDATE project_docs 
		SET title = ?, content = ?, file_path = ?, url = ?, version = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`).run(
		body.title || existing.title,
		body.content || existing.content,
		body.file_path !== undefined ? body.file_path : existing.file_path,
		body.url !== undefined ? body.url : existing.url,
		newVersion,
		params.docId
	);
	
	// Return updated document
	const updated = db.prepare('SELECT * FROM project_docs WHERE id = ?').get(params.docId);
	return json(updated);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	
	// Verify document exists and belongs to project
	const doc = db.prepare(`
		SELECT id FROM project_docs 
		WHERE id = ? AND project_id = ?
	`).get(params.docId, params.id);
	
	if (!doc) {
		throw error(404, 'Document not found');
	}
	
	// Delete document (CASCADE will handle versions)
	db.prepare('DELETE FROM project_docs WHERE id = ?').run(params.docId);
	
	return json({ message: 'Document deleted successfully' });
};
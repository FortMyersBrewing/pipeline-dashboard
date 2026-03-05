import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db';

const DOC_TEMPLATES = {
	spec: `# Specification

## Problem
What problem are we solving?

## Solution  
How will we solve it?

## Requirements
- Functional requirements
- Non-functional requirements

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2`,

	design: `# Design Document

## Overview
Brief description of the design

## User Flow
Step by step user journey

## Components
Key UI/UX components

## Mockup Notes
Links to designs, wireframes, prototypes`,

	architecture: `# Architecture Document

## System Overview
High-level architecture description

## Components
Major system components and their responsibilities

## Data Flow
How data moves through the system

## Dependencies
External dependencies and integrations`,

	reference: `# Reference Document

## Overview
What this document covers

## Links
- [Resource 1](url)
- [Resource 2](url)

## Notes
Additional context and information`,

	notes: `# Notes

## Meeting Notes
Date:
Attendees:

## Discussion Points
- Point 1
- Point 2

## Action Items
- [ ] Action 1
- [ ] Action 2`
};

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	
	// Validate project exists
	const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(params.id);
	if (!project) {
		throw error(404, 'Project not found');
	}
	
	// Get all documents for the project
	const docs = db.prepare(`
		SELECT * FROM project_docs 
		WHERE project_id = ? 
		ORDER BY created_at DESC
	`).all(params.id);
	
	return json(docs);
};

export const POST: RequestHandler = async ({ params, request }) => {
	const db = getDb();
	const body = await request.json();
	
	// Validate project exists
	const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(params.id);
	if (!project) {
		throw error(404, 'Project not found');
	}
	
	// Validate required fields
	if (!body.title || !body.doc_type) {
		return json({ error: 'title and doc_type are required' }, { status: 400 });
	}
	
	// Validate doc_type
	const validTypes = ['spec', 'design', 'architecture', 'reference', 'notes'];
	if (!validTypes.includes(body.doc_type)) {
		return json({ error: 'Invalid doc_type' }, { status: 400 });
	}
	
	// Use template content if no content provided
	const content = body.content || DOC_TEMPLATES[body.doc_type as keyof typeof DOC_TEMPLATES];
	
	// Insert new document
	const result = db.prepare(`
		INSERT INTO project_docs (project_id, title, doc_type, content, file_path, url, version)
		VALUES (?, ?, ?, ?, ?, ?, 1)
	`).run(params.id, body.title, body.doc_type, content, body.file_path || null, body.url || null);
	
	// Return created document
	const created = db.prepare('SELECT * FROM project_docs WHERE id = ?').get(result.lastInsertRowid);
	return json(created, { status: 201 });
};
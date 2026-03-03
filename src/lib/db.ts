import Database from 'better-sqlite3';
import { resolve } from 'path';

const DB_PATH = resolve(process.cwd(), 'pipeline.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
	if (!_db) {
		_db = new Database(DB_PATH);
		_db.pragma('journal_mode = WAL');
		_db.pragma('foreign_keys = ON');
		initDb(_db);
	}
	return _db;
}

function initDb(db: Database.Database) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			repo_path TEXT NOT NULL,
			repo_url TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS tasks (
			id TEXT PRIMARY KEY,
			project_id TEXT REFERENCES projects(id),
			title TEXT NOT NULL,
			description TEXT,
			status TEXT DEFAULT 'queued',
			current_stage TEXT,
			attempt INTEGER DEFAULT 0,
			max_attempts INTEGER DEFAULT 3,
			priority TEXT DEFAULT 'medium',
			assignee TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			completed_at DATETIME
		);

		CREATE TABLE IF NOT EXISTS specs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			task_id TEXT REFERENCES tasks(id),
			version INTEGER NOT NULL,
			content TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS runs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			task_id TEXT REFERENCES tasks(id),
			attempt INTEGER NOT NULL,
			stage TEXT NOT NULL,
			agent TEXT,
			status TEXT NOT NULL,
			result TEXT,
			started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			finished_at DATETIME,
			duration_ms INTEGER
		);

		CREATE TABLE IF NOT EXISTS events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			task_id TEXT,
			type TEXT NOT NULL,
			message TEXT NOT NULL,
			agent TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`);

	// Seed data if empty
	const count = db.prepare('SELECT COUNT(*) as n FROM projects').get() as { n: number };
	if (count.n === 0) {
		seed(db);
	}
}

function seed(db: Database.Database) {
	db.prepare(`INSERT INTO projects (id, name, repo_path, repo_url) VALUES (?, ?, ?, ?)`).run(
		'tapwright',
		'Tapwright',
		'~/projects/brewplatform',
		'https://github.com/FortMyersBrewing/brewplatform'
	);

	const now = new Date().toISOString();
	const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
	const tenMinAgo = new Date(Date.now() - 10 * 60000).toISOString();
	const hourAgo = new Date(Date.now() - 60 * 60000).toISOString();

	// Task 1: In review stage
	db.prepare(`INSERT INTO tasks (id, project_id, title, description, status, current_stage, attempt, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
		'task-001', 'tapwright', 'Add vendor signup API endpoint',
		'Create POST /api/vendors endpoint with validation for name, email, phone, and SMS consent fields.',
		'reviewing', 'reviewer', 1, 'high', hourAgo, fiveMinAgo
	);
	db.prepare(`INSERT INTO runs (task_id, attempt, stage, agent, status, started_at, finished_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('task-001', 1, 'scout', 'claude-sonnet', 'passed', hourAgo, new Date(Date.now() - 55 * 60000).toISOString(), 45000);
	db.prepare(`INSERT INTO runs (task_id, attempt, stage, agent, status, started_at, finished_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('task-001', 1, 'builder', 'claude-sonnet', 'passed', new Date(Date.now() - 50 * 60000).toISOString(), new Date(Date.now() - 40 * 60000).toISOString(), 600000);
	db.prepare(`INSERT INTO runs (task_id, attempt, stage, agent, status, started_at, finished_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('task-001', 1, 'gatekeeper', 'automated', 'passed', new Date(Date.now() - 38 * 60000).toISOString(), new Date(Date.now() - 37 * 60000).toISOString(), 60000);
	db.prepare(`INSERT INTO runs (task_id, attempt, stage, agent, status, started_at, finished_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('task-001', 1, 'reviewer', 'codex-gpt', 'running', fiveMinAgo, null, null);

	db.prepare(`INSERT INTO events (task_id, type, message, agent, created_at) VALUES (?, ?, ?, ?, ?)`).run('task-001', 'stage_start', 'Scout started: analyzing codebase for vendor endpoint', 'claude-sonnet', hourAgo);
	db.prepare(`INSERT INTO events (task_id, type, message, agent, created_at) VALUES (?, ?, ?, ?, ?)`).run('task-001', 'stage_pass', 'Scout completed: spec v1 written (12 files identified)', 'claude-sonnet', new Date(Date.now() - 55 * 60000).toISOString());
	db.prepare(`INSERT INTO events (task_id, type, message, agent, created_at) VALUES (?, ?, ?, ?, ?)`).run('task-001', 'stage_pass', 'Builder completed: 4 files modified, all gates passing', 'claude-sonnet', new Date(Date.now() - 40 * 60000).toISOString());
	db.prepare(`INSERT INTO events (task_id, type, message, agent, created_at) VALUES (?, ?, ?, ?, ?)`).run('task-001', 'stage_pass', 'Gatekeeper: ruff ✅ mypy ✅ pytest ✅', 'automated', new Date(Date.now() - 37 * 60000).toISOString());
	db.prepare(`INSERT INTO events (task_id, type, message, agent, created_at) VALUES (?, ?, ?, ?, ?)`).run('task-001', 'stage_start', 'Reviewer started: reviewing diff against spec', 'codex-gpt', fiveMinAgo);

	// Task 2: Building (attempt 2 after rejection)
	db.prepare(`INSERT INTO tasks (id, project_id, title, description, status, current_stage, attempt, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
		'task-002', 'tapwright', 'Vendor list page with search and filters',
		'Create /vendors page showing all registered vendors with search by name, filter by status, and pagination.',
		'building', 'builder', 2, 'medium', new Date(Date.now() - 2 * 3600000).toISOString(), tenMinAgo
	);
	db.prepare(`INSERT INTO runs (task_id, attempt, stage, agent, status, result, started_at, finished_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('task-002', 1, 'scout', 'claude-sonnet', 'passed', null, new Date(Date.now() - 2 * 3600000).toISOString(), new Date(Date.now() - 110 * 60000).toISOString(), 60000);
	db.prepare(`INSERT INTO runs (task_id, attempt, stage, agent, status, result, started_at, finished_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('task-002', 1, 'builder', 'claude-sonnet', 'passed', null, new Date(Date.now() - 105 * 60000).toISOString(), new Date(Date.now() - 90 * 60000).toISOString(), 900000);
	db.prepare(`INSERT INTO runs (task_id, attempt, stage, agent, status, result, started_at, finished_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('task-002', 1, 'gatekeeper', 'automated', 'passed', null, new Date(Date.now() - 88 * 60000).toISOString(), new Date(Date.now() - 87 * 60000).toISOString(), 60000);
	db.prepare(`INSERT INTO runs (task_id, attempt, stage, agent, status, result, started_at, finished_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('task-002', 1, 'reviewer', 'codex-gpt', 'rejected', 'Missing pagination params validation. Search does not handle special characters.', new Date(Date.now() - 85 * 60000).toISOString(), new Date(Date.now() - 80 * 60000).toISOString(), 300000);
	db.prepare(`INSERT INTO runs (task_id, attempt, stage, agent, status, started_at, finished_at, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('task-002', 2, 'scout', 'claude-sonnet', 'passed', new Date(Date.now() - 30 * 60000).toISOString(), new Date(Date.now() - 25 * 60000).toISOString(), 50000);
	db.prepare(`INSERT INTO runs (task_id, attempt, stage, agent, status, started_at) VALUES (?, ?, ?, ?, ?, ?)`).run('task-002', 2, 'builder', 'claude-sonnet', 'running', tenMinAgo);

	db.prepare(`INSERT INTO events (task_id, type, message, agent, created_at) VALUES (?, ?, ?, ?, ?)`).run('task-002', 'stage_fail', 'Reviewer rejected: missing pagination validation + special char handling', 'codex-gpt', new Date(Date.now() - 80 * 60000).toISOString());
	db.prepare(`INSERT INTO events (task_id, type, message, agent, created_at) VALUES (?, ?, ?, ?, ?)`).run('task-002', 'retry', 'Retry attempt 2: feeding rejection reasons to Scout', 'coordinator', new Date(Date.now() - 30 * 60000).toISOString());
	db.prepare(`INSERT INTO events (task_id, type, message, agent, created_at) VALUES (?, ?, ?, ?, ?)`).run('task-002', 'stage_start', 'Builder started (attempt 2)', 'claude-sonnet', tenMinAgo);

	// Task 3: Queued
	db.prepare(`INSERT INTO tasks (id, project_id, title, description, status, current_stage, attempt, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
		'task-003', 'tapwright', 'SMS consent confirmation flow',
		'After vendor signs up with SMS consent, send confirmation SMS via Twilio and track opt-in status.',
		'queued', null, 0, 'medium', now, now
	);
}

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
			slug TEXT NOT NULL UNIQUE,
			repo_path TEXT NOT NULL,
			repo_url TEXT,
			stack_type TEXT NOT NULL,
			status TEXT DEFAULT 'active',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

		CREATE TABLE IF NOT EXISTS agent_status (
			agent_id TEXT PRIMARY KEY,
			status TEXT NOT NULL,
			current_task TEXT,
			last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		-- New tables for projects enhancement
		CREATE TABLE IF NOT EXISTS project_docs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			title TEXT NOT NULL,
			doc_type TEXT NOT NULL,
			content TEXT,
			file_path TEXT,
			url TEXT,
			version INTEGER DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS doc_versions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			doc_id INTEGER NOT NULL REFERENCES project_docs(id) ON DELETE CASCADE,
			version INTEGER NOT NULL,
			content TEXT NOT NULL,
			changed_by TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS project_deps (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			depends_on TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			note TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(project_id, depends_on)
		);
	`);

	// Add new columns to projects table if they don't exist
	try {
		db.exec(`ALTER TABLE projects ADD COLUMN description TEXT`);
	} catch (e) {
		// Column already exists, ignore
	}
	try {
		db.exec(`ALTER TABLE projects ADD COLUMN tags TEXT`);
	} catch (e) {
		// Column already exists, ignore
	}
	try {
		db.exec(`ALTER TABLE projects ADD COLUMN default_priority TEXT DEFAULT 'medium'`);
	} catch (e) {
		// Column already exists, ignore
	}
	try {
		db.exec(`ALTER TABLE projects ADD COLUMN default_branch TEXT DEFAULT 'main'`);
	} catch (e) {
		// Column already exists, ignore
	}
	try {
		db.exec(`ALTER TABLE projects ADD COLUMN github_org TEXT`);
	} catch (e) {
		// Column already exists, ignore
	}
	try {
		db.exec(`ALTER TABLE projects ADD COLUMN template TEXT`);
	} catch (e) {
		// Column already exists, ignore
	}
	try {
		db.exec(`ALTER TABLE projects ADD COLUMN env_notes TEXT`);
	} catch (e) {
		// Column already exists, ignore
	}

	// Add new columns to tasks table for Phase 3 (context bundling)
	try {
		db.exec(`ALTER TABLE tasks ADD COLUMN bundled_context TEXT`);
	} catch (e) {
		// Column already exists, ignore
	}
	try {
		db.exec(`ALTER TABLE tasks ADD COLUMN context_docs TEXT`);
	} catch (e) {
		// Column already exists, ignore
	}
	try {
		db.exec(`ALTER TABLE tasks ADD COLUMN context_files TEXT`);
	} catch (e) {
		// Column already exists, ignore
	}
	try {
		db.exec(`ALTER TABLE tasks ADD COLUMN branch_strategy TEXT DEFAULT 'main'`);
	} catch (e) {
		// Column already exists, ignore
	}

	// Create task actions table
	try {
		db.exec(`
			CREATE TABLE IF NOT EXISTS task_actions (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
				action TEXT NOT NULL,
				reason TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`);
	} catch (e) {
		// Table already exists, ignore
	}

	// Seed projects if none exist
	const count = db.prepare('SELECT COUNT(*) as n FROM projects').get() as { n: number };
	if (count.n === 0) {
		const projects = [
			{
				id: 'tapwright',
				name: 'Tapwright',
				slug: 'tapwright', 
				repo_path: '~/projects/brewplatform',
				repo_url: 'https://github.com/FortMyersBrewing/brewplatform',
				stack_type: 'python'
			},
			{
				id: 'pipeline-dashboard',
				name: 'Pipeline Dashboard',
				slug: 'pipeline-dashboard',
				repo_path: '~/projects/pipeline-dashboard-build',
				repo_url: 'https://github.com/FortMyersBrewing/pipeline-dashboard',
				stack_type: 'node'
			},
			{
				id: 'anti-slop-pipeline',
				name: 'Anti-Slop Pipeline',
				slug: 'anti-slop-pipeline',
				repo_path: '~/.openclaw/workspace/agents/pipeline',
				repo_url: null,
				stack_type: 'shell'
			},
			{
				id: 'fmb-menu',
				name: 'FMB Menu',
				slug: 'fmb-menu',
				repo_path: '~/.openclaw/workspace/fmb-menu',
				repo_url: null,
				stack_type: 'node'
			}
		];

		const insertProject = db.prepare(`INSERT INTO projects (id, name, slug, repo_path, repo_url, stack_type) VALUES (?, ?, ?, ?, ?, ?)`);
		for (const project of projects) {
			insertProject.run(project.id, project.name, project.slug, project.repo_path, project.repo_url, project.stack_type);
		}
	}
}

function _seed_disabled(db: Database.Database) {
	// Disabled seed function - no hardcoded project data
}

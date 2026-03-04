export interface Project {
	id: string;
	name: string;
	slug: string;
	repo_path: string;
	repo_url: string | null;
	stack_type: string;
	status: string;
	description?: string;
	tags?: string[]; // parsed from JSON
	default_priority?: string;
	default_branch?: string;
	github_org?: string;
	template?: string;
	env_notes?: string;
	created_at: string;
	updated_at: string;
	task_counts?: Record<string, number>;
	total_tasks?: number;
}

export interface Task {
	id: string;
	project_id: string;
	project_name?: string;
	project_slug?: string;
	project_stack_type?: string;
	title: string;
	description: string | null;
	status: string;
	current_stage: string | null;
	attempt: number;
	max_attempts: number;
	priority: string;
	assignee: string | null;
	created_at: string;
	updated_at: string;
	completed_at: string | null;
	runs?: Run[];
	events?: PipelineEvent[];
	specs?: Spec[];
}

export interface Run {
	id: number;
	task_id: string;
	attempt: number;
	stage: string;
	agent: string | null;
	status: string;
	result: string | null;
	started_at: string;
	finished_at: string | null;
	duration_ms: number | null;
}

export interface Spec {
	id: number;
	task_id: string;
	version: number;
	content: string;
	created_at: string;
}

export interface PipelineEvent {
	id: number;
	task_id: string | null;
	type: string;
	message: string;
	agent: string | null;
	created_at: string;
}

export const STAGES = ['scout', 'builder', 'gatekeeper', 'reviewer', 'qa'] as const;

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
	done: { bg: 'bg-success-bg', text: 'text-success' },
	queued: { bg: 'bg-bg-hover', text: 'text-text-muted' },
	paused: { bg: 'bg-warning-bg', text: 'text-warning' },
	failed: { bg: 'bg-error-bg', text: 'text-error' },
	scouting: { bg: 'bg-info-bg', text: 'text-info' },
	building: { bg: 'bg-info-bg', text: 'text-info' },
	gating: { bg: 'bg-info-bg', text: 'text-info' },
	reviewing: { bg: 'bg-info-bg', text: 'text-info' },
	testing: { bg: 'bg-info-bg', text: 'text-info' },
};

export const STAGE_LABELS: Record<string, string> = {
	scout: 'Scout',
	builder: 'Build',
	gatekeeper: 'Gate',
	reviewer: 'Review',
	qa: 'QA',
};

export const STACK_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
	python: { bg: 'bg-blue-600/20', text: 'text-blue-400' },
	node: { bg: 'bg-green-600/20', text: 'text-green-400' },
	rust: { bg: 'bg-orange-600/20', text: 'text-orange-400' },
	shell: { bg: 'bg-gray-600/20', text: 'text-gray-400' },
	go: { bg: 'bg-cyan-600/20', text: 'text-cyan-400' },
	java: { bg: 'bg-red-600/20', text: 'text-red-400' },
	default: { bg: 'bg-bg/60', text: 'text-text-dim' },
};

// New interfaces for projects enhancement
export interface ProjectDoc {
	id: number;
	project_id: string;
	title: string;
	doc_type: 'spec' | 'design' | 'architecture' | 'reference' | 'notes';
	content?: string;
	file_path?: string;
	url?: string;
	version: number;
	created_at: string;
	updated_at: string;
}

export interface ProjectDependency {
	id: number;
	project_id: string;
	depends_on: string;
	depends_on_name?: string;
	note?: string;
	created_at: string;
}

export interface GitHubRepo {
	name: string;
	url: string;
	description?: string;
	primaryLanguage?: string;
}

export interface ProjectCreateRequest {
	name: string;
	slug?: string;
	description?: string;
	stack_type: string;
	repo_path?: string;
	repo_url?: string;
	github_action: 'none' | 'import' | 'create' | 'link';
	github_repo?: string;
	github_visibility?: 'public' | 'private';
	tags?: string[];
	default_priority?: 'low' | 'medium' | 'high' | 'urgent';
}

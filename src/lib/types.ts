export interface Project {
	id: string;
	name: string;
	repo_path: string;
	repo_url: string | null;
	created_at: string;
	task_counts?: Record<string, number>;
}

export interface Task {
	id: string;
	project_id: string;
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

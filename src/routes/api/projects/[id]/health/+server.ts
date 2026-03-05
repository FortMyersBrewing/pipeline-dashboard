import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getDb } from '$lib/db';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export const GET: RequestHandler = async ({ params }) => {
	const projectId = params.id;
	
	try {
		const db = getDb();
		
		// Get project details
		const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
		if (!project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}
		
		// Initialize health metrics
		let lastCommitDate: string | null = null;
		let daysSinceCommit: number | null = null;
		let freshness: 'fresh' | 'aging' | 'stale' = 'stale';
		
		// Get last commit date if repo exists
		if (project.repo_path) {
			try {
				let repoPath = project.repo_path;
				if (repoPath.startsWith('~')) {
					repoPath = path.join(os.homedir(), repoPath.slice(1));
				}
				
				// Check if git repo exists
				await execAsync(`test -d "${repoPath}/.git"`);
				
				// Get last commit date
				const { stdout: lastCommit } = await execAsync(
					`cd "${repoPath}" && git log -1 --format='%ai'`
				);
				
				if (lastCommit.trim()) {
					lastCommitDate = lastCommit.trim();
					const commitDate = new Date(lastCommitDate);
					const now = new Date();
					daysSinceCommit = Math.floor((now.getTime() - commitDate.getTime()) / (1000 * 60 * 60 * 24));
					
					// Determine freshness
					if (daysSinceCommit <= 7) {
						freshness = 'fresh';
					} else if (daysSinceCommit <= 21) {
						freshness = 'aging';
					} else {
						freshness = 'stale';
					}
				}
			} catch (gitError) {
				// Git repo doesn't exist or is not accessible
				console.warn(`Could not access git repo for project ${projectId}:`, gitError);
			}
		}
		
		// Get task statistics
		const taskStats = db.prepare(`
			SELECT 
				status,
				COUNT(*) as count
			FROM tasks 
			WHERE project_id = ? 
			GROUP BY status
		`).all(projectId) as { status: string; count: number }[];
		
		const taskCounts: Record<string, number> = {};
		let totalTasks = 0;
		
		for (const stat of taskStats) {
			taskCounts[stat.status] = stat.count;
			totalTasks += stat.count;
		}
		
		const openTasks = (taskCounts.queued || 0) + (taskCounts.in_progress || 0);
		const failedTasks = taskCounts.failed || 0;
		const completedTasks = taskCounts.done || 0;
		
		// Get CI status if available
		let ciStatus: 'passing' | 'failing' | 'running' | 'none' = 'none';
		if (project.repo_url) {
			try {
				// Make a quick CI check (use existing endpoint logic)
				const match = project.repo_url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
				if (match) {
					const [, owner, repo] = match;
					const repoIdentifier = `${owner}/${repo}`;
					
					try {
						const { stdout: ciOutput } = await execAsync(
							`gh run list --repo ${repoIdentifier} --json status,conclusion --limit 3`
						);
						
						if (ciOutput.trim()) {
							const runs = JSON.parse(ciOutput);
							if (runs.length > 0) {
								const latestRun = runs[0];
								if (latestRun.status === 'in_progress' || latestRun.status === 'queued') {
									ciStatus = 'running';
								} else if (latestRun.status === 'completed') {
									ciStatus = latestRun.conclusion === 'success' ? 'passing' : 'failing';
								}
							}
						}
					} catch {
						// CI not configured or not accessible
						ciStatus = 'none';
					}
				}
			} catch {
				// GitHub operations failed, skip CI status
			}
		}
		
		// Calculate overall health score
		const healthScore = calculateHealthScore({
			freshness,
			daysSinceCommit,
			openTasks,
			failedTasks,
			totalTasks,
			ciStatus
		});
		
		// Determine activity level
		const activityLevel = getActivityLevel(openTasks, failedTasks, totalTasks, daysSinceCommit);
		
		return json({
			project_id: projectId,
			last_commit_date: lastCommitDate,
			days_since_commit: daysSinceCommit,
			freshness,
			open_tasks: openTasks,
			failed_tasks: failedTasks,
			completed_tasks: completedTasks,
			total_tasks: totalTasks,
			ci_status: ciStatus,
			health_score: healthScore,
			activity_level: activityLevel,
			task_breakdown: taskCounts,
			indicators: {
				has_recent_commits: daysSinceCommit !== null && daysSinceCommit <= 7,
				has_failed_tasks: failedTasks > 0,
				has_ci: ciStatus !== 'none',
				is_active: openTasks > 0
			}
		});
		
	} catch (error) {
		console.error('Failed to calculate project health:', error);
		
		return json({ 
			error: 'Failed to calculate project health' 
		}, { status: 500 });
	}
};

function calculateHealthScore(metrics: {
	freshness: 'fresh' | 'aging' | 'stale';
	daysSinceCommit: number | null;
	openTasks: number;
	failedTasks: number;
	totalTasks: number;
	ciStatus: 'passing' | 'failing' | 'running' | 'none';
}): 'healthy' | 'warning' | 'critical' {
	const { freshness, failedTasks, ciStatus } = metrics;
	
	// Critical conditions
	if (failedTasks > 0) return 'critical';
	if (ciStatus === 'failing') return 'critical';
	if (freshness === 'stale') return 'critical';
	
	// Warning conditions
	if (freshness === 'aging') return 'warning';
	if (ciStatus === 'none' && metrics.totalTasks > 0) return 'warning';
	
	// Healthy
	return 'healthy';
}

function getActivityLevel(
	openTasks: number,
	failedTasks: number,
	totalTasks: number,
	daysSinceCommit: number | null
): 'active' | 'idle' | 'stale' {
	if (failedTasks > 0 || openTasks > 0) {
		return 'active';
	}
	
	if (totalTasks === 0 && (daysSinceCommit === null || daysSinceCommit > 30)) {
		return 'stale';
	}
	
	return 'idle';
}
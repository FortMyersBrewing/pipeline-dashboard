import type { PageServerLoad } from './$types';
import type { Agent } from '../api/agents/+server';

export const load: PageServerLoad = async ({ fetch }) => {
	// Fetch real agents from our API
	const response = await fetch('/api/agents');
	const data = await response.json();
	
	return {
		agents: data.agents as Agent[]
	};
};

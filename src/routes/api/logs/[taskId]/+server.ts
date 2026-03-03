import type { RequestHandler } from './$types';
import { spawn } from 'child_process';

// SSE endpoint that tails the pipeline log file
export const GET: RequestHandler = ({ params }) => {
	const taskId = params.taskId;
	const logFile = `/tmp/pipeline-${taskId}.log`;

	const stream = new ReadableStream({
		start(controller) {
			// Send existing log content first
			const cat = spawn('cat', [logFile]);
			cat.stdout.on('data', (data: Buffer) => {
				const lines = data.toString().split('\n');
				for (const line of lines) {
					if (line.trim()) {
						// Strip ANSI codes for clean display
						const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
						controller.enqueue(`data: ${JSON.stringify({ line: clean, ts: Date.now() })}\n\n`);
					}
				}
			});

			// Then tail -f for live updates
			cat.on('close', () => {
				const tail = spawn('tail', ['-f', '-n', '0', logFile]);

				tail.stdout.on('data', (data: Buffer) => {
					const lines = data.toString().split('\n');
					for (const line of lines) {
						if (line.trim()) {
							const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
							controller.enqueue(`data: ${JSON.stringify({ line: clean, ts: Date.now() })}\n\n`);
						}
					}
				});

				// Heartbeat every 5s so the client knows we're alive
				const heartbeat = setInterval(() => {
					try {
						controller.enqueue(`data: ${JSON.stringify({ heartbeat: true, ts: Date.now() })}\n\n`);
					} catch {
						clearInterval(heartbeat);
						tail.kill();
					}
				}, 5000);

				// Cleanup on close
				const cleanup = () => {
					clearInterval(heartbeat);
					tail.kill();
				};

				controller.enqueue(`data: ${JSON.stringify({ line: '--- connected, streaming live ---', ts: Date.now() })}\n\n`);
			});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
};

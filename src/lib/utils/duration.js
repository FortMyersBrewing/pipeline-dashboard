/**
 * Format milliseconds into human-readable duration
 * @param {number|null|undefined} ms - Duration in milliseconds
 * @param {boolean} isRunning - Whether the run is still active
 * @returns {string} Formatted duration ("12s", "1m 34s", "Running...")
 */
export function formatDuration(ms, isRunning = false) {
    if (isRunning || ms === null || ms === undefined) {
        return isRunning ? 'Running...' : '—';
    }
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes === 0) {
        return `${seconds}s`;
    } else {
        return remainingSeconds === 0 
            ? `${minutes}m` 
            : `${minutes}m ${remainingSeconds}s`;
    }
}
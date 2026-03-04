#!/bin/bash
# Task Dispatcher — polls dashboard for dispatching tasks, notifies AVA
# Runs every 30s via launchd. Zero LLM cost for empty polls.
# Uses sessions_send to notify AVA, who orchestrates the pipeline.

DASHBOARD_URL="http://localhost:5555"
GATEWAY_URL="http://localhost:18789"
GATEWAY_TOKEN="b2987b6d9e5d6eb85823110daab019ca86f0b02eda5cbeb0"
LOCK_FILE="/tmp/task-dispatcher.lock"
LOG_FILE="/tmp/task-dispatcher.log"

# Prevent overlapping runs
if [ -f "$LOCK_FILE" ]; then
    LOCK_AGE=$(($(date +%s) - $(stat -f %m "$LOCK_FILE" 2>/dev/null || echo 0)))
    if [ "$LOCK_AGE" -lt 120 ]; then exit 0; fi
    rm -f "$LOCK_FILE"
fi
touch "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

# Check dashboard is up
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL/" 2>/dev/null)
if [ "$HTTP_CODE" != "200" ]; then exit 0; fi

# Get pending tasks (status = dispatching)
PENDING=$(curl -s "$DASHBOARD_URL/api/tasks/pending" 2>/dev/null)
TASK_COUNT=$(echo "$PENDING" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('tasks',[])))" 2>/dev/null)

if [ "$TASK_COUNT" = "0" ] || [ -z "$TASK_COUNT" ]; then exit 0; fi

# Build dispatch message with all pending tasks
DISPATCH_MSG=$(echo "$PENDING" | python3 -c "
import sys, json
data = json.load(sys.stdin)
tasks = data.get('tasks', [])
lines = ['[DISPATCH] ' + str(len(tasks)) + ' task(s) ready:']
for t in tasks:
    lines.append(f\"  - {t['id']} | {t.get('title','')} | {t.get('project_repo_path','')} | {t.get('description','')[:200]}\")
print('\n'.join(lines))
" 2>/dev/null)

echo "$(date): $DISPATCH_MSG" >> "$LOG_FILE"

# Notify AVA via sessions_send (non-blocking, fire and forget with timeout)
curl -s -m 5 -X POST "$GATEWAY_URL/tools/invoke" \
    -H "Authorization: Bearer $GATEWAY_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c "
import json
msg = '''$DISPATCH_MSG'''
print(json.dumps({
    'tool': 'sessions_send',
    'args': {
        'sessionKey': 'agent:main:main',
        'message': msg,
        'timeoutSeconds': 0
    }
}))
")" > /dev/null 2>&1 &

echo "$(date): Notified AVA" >> "$LOG_FILE"

#!/bin/bash
# Task Dispatcher — polls dashboard for pending tasks, spawns OpenClaw agents
# Runs every 30s via launchd. Zero LLM cost for empty polls.
# Uses sessions_spawn via gateway HTTP API for proper agent management.

DASHBOARD_URL="http://localhost:5555"
GATEWAY_URL="http://localhost:18789"
GATEWAY_TOKEN="b2987b6d9e5d6eb85823110daab019ca86f0b02eda5cbeb0"
LOCK_FILE="/tmp/task-dispatcher.lock"
LOG_FILE="/tmp/task-dispatcher.log"
MAX_CONCURRENT=2

# Prevent overlapping runs
if [ -f "$LOCK_FILE" ]; then
    LOCK_AGE=$(($(date +%s) - $(stat -f %m "$LOCK_FILE" 2>/dev/null || echo 0)))
    if [ "$LOCK_AGE" -lt 120 ]; then
        exit 0
    fi
    rm -f "$LOCK_FILE"
fi
touch "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

# Check dashboard is up
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL/" 2>/dev/null)
if [ "$HTTP_CODE" != "200" ]; then
    exit 0
fi

# Get pending tasks
PENDING=$(curl -s "$DASHBOARD_URL/api/tasks/pending" 2>/dev/null)
TASK_COUNT=$(echo "$PENDING" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('tasks',[])))" 2>/dev/null)

if [ "$TASK_COUNT" = "0" ] || [ -z "$TASK_COUNT" ]; then
    exit 0
fi

echo "$(date): Found $TASK_COUNT pending task(s)" >> "$LOG_FILE"

# Process first pending task
TASK_ID=$(echo "$PENDING" | python3 -c "import sys,json; print(json.load(sys.stdin)['tasks'][0]['id'])" 2>/dev/null)
TITLE=$(echo "$PENDING" | python3 -c "import sys,json; print(json.load(sys.stdin)['tasks'][0].get('title',''))" 2>/dev/null)
DESC=$(echo "$PENDING" | python3 -c "import sys,json; print(json.load(sys.stdin)['tasks'][0].get('description',''))" 2>/dev/null)
PROJECT_PATH=$(echo "$PENDING" | python3 -c "import sys,json; print(json.load(sys.stdin)['tasks'][0].get('project_repo_path',''))" 2>/dev/null)
STACK=$(echo "$PENDING" | python3 -c "import sys,json; print(json.load(sys.stdin)['tasks'][0].get('project_stack_type',''))" 2>/dev/null)

if [ -z "$TASK_ID" ]; then
    exit 0
fi

echo "$(date): Dispatching $TASK_ID: $TITLE" >> "$LOG_FILE"

# Mark task as assigned
curl -s -X PATCH "$DASHBOARD_URL/api/tasks/$TASK_ID" \
    -H "Content-Type: application/json" \
    -d "{\"assignee\":\"coder\",\"current_stage\":\"builder\",\"attempt\":1}" > /dev/null 2>&1

# Create run record
curl -s -X POST "$DASHBOARD_URL/api/tasks/$TASK_ID/runs" \
    -H "Content-Type: application/json" \
    -d "{\"stage\":\"builder\",\"attempt\":1,\"agent\":\"coder\",\"status\":\"running\"}" > /dev/null 2>&1

# Build task prompt
WORKDIR="${PROJECT_PATH:-~/projects/pipeline-dashboard-build}"
TASK_PROMPT="$TITLE

## Description
$DESC

## Project
- Path: $WORKDIR
- Stack: $STACK
- DB helper: getDb() from \$lib/db (NOT a default export) if SvelteKit
- Theme: Dark theme (#0A0A0B bg, #8B5CF6 purple accent) if dashboard

## Rules
- Make the changes described above
- Run checks after changes (npm run check for node, ruff/mypy for python)
- Fix any errors you introduce
- Commit with a descriptive message
- Do NOT change unrelated files"

# Spawn agent via gateway HTTP API — proper OpenClaw agent with session tracking
RESULT=$(curl -s -X POST "$GATEWAY_URL/tools/invoke" \
    -H "Authorization: Bearer $GATEWAY_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c "
import json
print(json.dumps({
    'tool': 'sessions_spawn',
    'args': {
        'task': $(python3 -c "import json; print(json.dumps('''$TASK_PROMPT'''))"),
        'agentId': 'coder',
        'label': '${TASK_ID}-builder',
        'mode': 'run'
    }
}))
" 2>/dev/null)")

echo "$(date): Spawn result for $TASK_ID: $RESULT" >> "$LOG_FILE"

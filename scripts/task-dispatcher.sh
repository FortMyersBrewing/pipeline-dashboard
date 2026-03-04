#!/bin/bash
# Task Dispatcher — polls dashboard for pending tasks, spawns builder agents directly
# Runs every 30s via launchd. Zero LLM cost for empty polls.
# Only spawns claude -p when there's actual work to do.

DASHBOARD_URL="http://localhost:5555"
LOCK_FILE="/tmp/task-dispatcher.lock"
LOG_FILE="/tmp/task-dispatcher.log"
MAX_CONCURRENT=2

# Prevent overlapping runs
if [ -f "$LOCK_FILE" ]; then
    LOCK_AGE=$(($(date +%s) - $(stat -f %m "$LOCK_FILE" 2>/dev/null || echo 0)))
    if [ "$LOCK_AGE" -lt 120 ]; then
        exit 0
    fi
    # Stale lock, remove it
    rm -f "$LOCK_FILE"
fi
touch "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

# Check dashboard is up
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL/" 2>/dev/null)
if [ "$HTTP_CODE" != "200" ]; then
    exit 0
fi

# Count currently running builder processes
RUNNING=$(pgrep -f "task-.*-builder" 2>/dev/null | wc -l | tr -d ' ')
if [ "$RUNNING" -ge "$MAX_CONCURRENT" ]; then
    exit 0
fi

# Get pending tasks (in_progress but no assignee)
PENDING=$(curl -s "$DASHBOARD_URL/api/tasks/pending" 2>/dev/null)
TASK_COUNT=$(echo "$PENDING" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('tasks',[])))" 2>/dev/null)

if [ "$TASK_COUNT" = "0" ] || [ -z "$TASK_COUNT" ]; then
    exit 0
fi

echo "$(date): Found $TASK_COUNT pending task(s), $RUNNING running" >> "$LOG_FILE"

# Process first pending task (one at a time per cycle)
TASK_JSON=$(echo "$PENDING" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data.get('tasks'):
    t = data['tasks'][0]
    print(json.dumps(t))
" 2>/dev/null)

TASK_ID=$(echo "$TASK_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)
TITLE=$(echo "$TASK_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('title',''))" 2>/dev/null)
DESC=$(echo "$TASK_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('description',''))" 2>/dev/null)
PROJECT_PATH=$(echo "$TASK_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('project_repo_path',''))" 2>/dev/null)

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

# Determine work directory
WORKDIR="${PROJECT_PATH:-$HOME/projects/pipeline-dashboard-build}"
WORKDIR=$(eval echo "$WORKDIR")  # Expand ~ 

# Build the prompt
PROMPT="You are working on: $TITLE

Description: $DESC

Project path: $WORKDIR

Rules:
- Make the changes described above
- Run any available checks (npm run check, ruff, mypy) before committing
- Fix any errors you introduce
- Commit with a descriptive message
- Do NOT change unrelated files"

# Spawn claude -p in background
# This is the ONLY part that costs tokens — and only when there's real work
nohup bash -c "
    cd '$WORKDIR' && \
    /opt/homebrew/bin/claude -p '$PROMPT' --dangerously-skip-permissions > /tmp/${TASK_ID}-builder.log 2>&1
    EXIT_CODE=\$?
    
    # Auto-complete the task when done
    if [ \$EXIT_CODE -eq 0 ]; then
        NOW=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
        curl -s -X PATCH '$DASHBOARD_URL/api/tasks/$TASK_ID' \
            -H 'Content-Type: application/json' \
            -d '{\"status\":\"done\",\"current_stage\":\"complete\",\"completed_at\":\"'\$NOW'\"}' > /dev/null 2>&1
        curl -s '$DASHBOARD_URL/api/tasks/$TASK_ID/runs' | python3 -c '
import sys,json
# No easy way to update via this endpoint, but task is marked done
' 2>/dev/null
        echo \"\$(date): $TASK_ID completed successfully\" >> '$LOG_FILE'
    else
        echo \"\$(date): $TASK_ID failed with exit code \$EXIT_CODE\" >> '$LOG_FILE'
    fi
" > /dev/null 2>&1 &

echo "$(date): Spawned builder for $TASK_ID (pid $!)" >> "$LOG_FILE"

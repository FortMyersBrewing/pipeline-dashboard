#!/bin/bash
# Task Dispatcher — polls dashboard for pending tasks, launches full pipeline
# Runs every 30s via launchd. Zero LLM cost for empty polls.
# When a task is found, spawns pipeline-runner.sh in background.

DASHBOARD_URL="http://localhost:5555"
DISPATCH_DIR="/tmp/pipeline-dispatch"
LOCK_FILE="/tmp/task-dispatcher.lock"
LOG_FILE="/tmp/task-dispatcher.log"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MAX_CONCURRENT=2

# Prevent overlapping runs
if [ -f "$LOCK_FILE" ]; then
    LOCK_AGE=$(($(date +%s) - $(stat -f %m "$LOCK_FILE" 2>/dev/null || echo 0)))
    if [ "$LOCK_AGE" -lt 120 ]; then exit 0; fi
    rm -f "$LOCK_FILE"
fi
touch "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

mkdir -p "$DISPATCH_DIR"

# Check dashboard is up
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL/" 2>/dev/null)
if [ "$HTTP_CODE" != "200" ]; then exit 0; fi

# Check how many pipelines are already running
RUNNING=$(pgrep -f "pipeline-runner.sh" 2>/dev/null | wc -l | tr -d ' ')
if [ "$RUNNING" -ge "$MAX_CONCURRENT" ]; then exit 0; fi

# Get pending tasks
PENDING=$(curl -s "$DASHBOARD_URL/api/tasks/pending" 2>/dev/null)
TASK_COUNT=$(echo "$PENDING" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('tasks',[])))" 2>/dev/null)

if [ "$TASK_COUNT" = "0" ] || [ -z "$TASK_COUNT" ]; then exit 0; fi

# Process first pending task
TASK_JSON=$(echo "$PENDING" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['tasks'][0]))" 2>/dev/null)
TASK_ID=$(echo "$TASK_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)

if [ -z "$TASK_ID" ]; then exit 0; fi

# Write dispatch file
TASK_FILE="$DISPATCH_DIR/${TASK_ID}.json"
if [ -f "$TASK_FILE" ]; then exit 0; fi  # Already dispatched
echo "$TASK_JSON" > "$TASK_FILE"

# Mark task as assigned
curl -s -X PATCH "$DASHBOARD_URL/api/tasks/$TASK_ID" \
    -H "Content-Type: application/json" \
    -d '{"assignee":"pipeline","current_stage":"scout","attempt":1}' > /dev/null 2>&1

echo "$(date): Dispatching $TASK_ID to pipeline-runner" >> "$LOG_FILE"

# Launch full pipeline in background
nohup "$SCRIPT_DIR/pipeline-runner.sh" "$TASK_FILE" >> "$LOG_FILE" 2>&1 &

echo "$(date): Pipeline started for $TASK_ID (pid $!)" >> "$LOG_FILE"

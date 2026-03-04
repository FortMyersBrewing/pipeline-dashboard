#!/bin/bash
# Task Dispatcher — polls dashboard for pending tasks
# Runs every 30s via launchd. Zero LLM cost.
# Writes dispatch files that AVA picks up via heartbeat and spawns agents.

DASHBOARD_URL="http://localhost:5555"
DISPATCH_DIR="/tmp/pipeline-dispatch"
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

mkdir -p "$DISPATCH_DIR"

# Check dashboard is up
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DASHBOARD_URL/" 2>/dev/null)
if [ "$HTTP_CODE" != "200" ]; then exit 0; fi

# Get pending tasks
PENDING=$(curl -s "$DASHBOARD_URL/api/tasks/pending" 2>/dev/null)
TASK_COUNT=$(echo "$PENDING" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('tasks',[])))" 2>/dev/null)

if [ "$TASK_COUNT" = "0" ] || [ -z "$TASK_COUNT" ]; then exit 0; fi

# Write dispatch files for each pending task
echo "$PENDING" | python3 -c "
import sys, json, os
data = json.load(sys.stdin)
for t in data.get('tasks', []):
    task_id = t['id']
    path = os.path.join('$DISPATCH_DIR', f'{task_id}.json')
    if os.path.exists(path):
        continue
    # Mark as assigned so we don't re-dispatch
    import urllib.request
    req = urllib.request.Request(
        f'$DASHBOARD_URL/api/tasks/{task_id}',
        data=json.dumps({'assignee':'coder','current_stage':'builder','attempt':1}).encode(),
        headers={'Content-Type':'application/json'},
        method='PATCH'
    )
    try: urllib.request.urlopen(req)
    except: pass
    # Write dispatch file
    with open(path, 'w') as f:
        json.dump(t, f, indent=2)
    print(f'Queued {task_id}: {t.get(\"title\",\"\")}')
" 2>/dev/null | while read -r line; do
    echo "$(date): $line" >> "$LOG_FILE"
done

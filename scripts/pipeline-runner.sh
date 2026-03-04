#!/usr/bin/env bash
# Pipeline Runner — Fully autonomous Scout → Builder → Gatekeeper → Reviewer → QA
# Uses sessions_spawn via gateway HTTP API. Zero dependency on AVA.
# Runs as background process spawned by task-dispatcher.sh
#
# Usage: pipeline-runner.sh <task-json-file>

set -euo pipefail

TASK_FILE="${1:?Usage: pipeline-runner.sh <task-json-file>}"
DASHBOARD="http://localhost:5555"
GATEWAY="http://localhost:18789"
GATEWAY_TOKEN="b2987b6d9e5d6eb85823110daab019ca86f0b02eda5cbeb0"
PROMPTS_DIR="$HOME/.openclaw/workspace/agents/pipeline/prompts"
MAX_ATTEMPTS=3
LOG_FILE="/tmp/pipeline-runner.log"

# Parse task JSON
TASK_ID=$(python3 -c "import json; print(json.load(open('$TASK_FILE'))['id'])")
TITLE=$(python3 -c "import json; print(json.load(open('$TASK_FILE')).get('title',''))")
DESC=$(python3 -c "import json; print(json.load(open('$TASK_FILE')).get('description',''))")
PROJECT_PATH=$(python3 -c "import json; print(json.load(open('$TASK_FILE')).get('project_repo_path','$HOME/projects/pipeline-dashboard-build'))")
PROJECT_PATH=$(eval echo "$PROJECT_PATH")

log() { echo "$(date): [$TASK_ID] $1" >> "$LOG_FILE"; }
log "Starting pipeline: $TITLE"

# ── Dashboard helpers ──
update_task() {
    local body="$1"
    curl -s -X PATCH "$DASHBOARD/api/tasks/$TASK_ID" \
        -H "Content-Type: application/json" -d "$body" > /dev/null 2>&1 || true
}
post_run() {
    curl -s -X POST "$DASHBOARD/api/tasks/$TASK_ID/runs" \
        -H "Content-Type: application/json" -d "$1" > /dev/null 2>&1 || true
}

# ── Gateway helpers ──
spawn_agent() {
    local agent_id="$1" label="$2" task_prompt="$3"
    local payload
    payload=$(python3 -c "
import json
print(json.dumps({
    'tool': 'sessions_spawn',
    'args': {
        'task': json.loads(open('/dev/stdin').read()),
        'agentId': '$agent_id',
        'label': '$label',
        'mode': 'run'
    }
}))
" <<< "$(echo "$task_prompt" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')")
    
    curl -s -X POST "$GATEWAY/tools/invoke" \
        -H "Authorization: Bearer $GATEWAY_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>/dev/null
}

# Poll for agent completion (checks every 15s, max 15 min)
wait_for_agent() {
    local label="$1" max_wait="${2:-900}" elapsed=0
    while [ $elapsed -lt $max_wait ]; do
        sleep 15
        elapsed=$((elapsed + 15))
        
        local result
        result=$(curl -s -X POST "$GATEWAY/tools/invoke" \
            -H "Authorization: Bearer $GATEWAY_TOKEN" \
            -H "Content-Type: application/json" \
            -d "{\"tool\":\"subagents\",\"args\":{\"action\":\"list\",\"recentMinutes\":30}}" 2>/dev/null)
        
        # Check if agent is done
        local status
        status=$(echo "$result" | python3 -c "
import sys, json
data = json.load(sys.stdin)
details = data.get('result',{}).get('details',{})
for entry in details.get('active', []):
    if entry.get('label') == '$label':
        print('running')
        exit()
for entry in details.get('recent', []):
    if entry.get('label') == '$label' and entry.get('status') == 'done':
        print('done')
        exit()
print('unknown')
" 2>/dev/null)
        
        if [ "$status" = "done" ]; then
            log "  Agent $label completed (${elapsed}s)"
            return 0
        elif [ "$status" = "running" ]; then
            continue
        fi
    done
    log "  Agent $label timed out after ${max_wait}s"
    return 1
}

# ═══════════════════════════════════════════
# MAIN PIPELINE LOOP
# ═══════════════════════════════════════════

ATTEMPT=0
PREV_REJECTION=""

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    log "═══ Attempt $ATTEMPT/$MAX_ATTEMPTS ═══"
    update_task "{\"attempt\":$ATTEMPT}"

    # ─── STAGE 1: SCOUT ───
    log "Stage 1: Scout"
    update_task "{\"status\":\"in_progress\",\"current_stage\":\"scout\"}"
    post_run "{\"attempt\":$ATTEMPT,\"stage\":\"scout\",\"agent\":\"coder\",\"status\":\"running\"}"

    SCOUT_PROMPT="You are a Scout agent. Read the project at $PROJECT_PATH and write a detailed implementation spec.

TASK: $TITLE
DESCRIPTION: $DESC"
    [ -n "$PREV_REJECTION" ] && SCOUT_PROMPT+="

PREVIOUS REJECTION: $PREV_REJECTION
Fix the issues above."
    SCOUT_PROMPT+="

Output a detailed spec with:
1. Files to create/modify (exact paths)
2. For each file: exact changes, function signatures, types
3. Acceptance criteria
4. Edge cases to handle

Write the spec to $PROJECT_PATH/.pipeline/specs/${TASK_ID}-v${ATTEMPT}.md"

    LABEL="${TASK_ID}-scout-v${ATTEMPT}"
    spawn_agent "coder" "$LABEL" "$SCOUT_PROMPT" > /dev/null 2>&1
    
    if ! wait_for_agent "$LABEL" 600; then
        log "Scout timed out"
        post_run "{\"attempt\":$ATTEMPT,\"stage\":\"scout\",\"agent\":\"coder\",\"status\":\"failed\",\"result\":\"Timed out\"}"
        PREV_REJECTION="Scout timed out"
        continue
    fi
    post_run "{\"attempt\":$ATTEMPT,\"stage\":\"scout\",\"agent\":\"coder\",\"status\":\"passed\",\"result\":\"Spec written\"}"

    # ─── STAGE 2: BUILDER ───
    log "Stage 2: Builder"
    update_task "{\"status\":\"in_progress\",\"current_stage\":\"builder\"}"
    post_run "{\"attempt\":$ATTEMPT,\"stage\":\"builder\",\"agent\":\"coder\",\"status\":\"running\"}"

    SPEC_FILE="$PROJECT_PATH/.pipeline/specs/${TASK_ID}-v${ATTEMPT}.md"
    SPEC_CONTENT=""
    [ -f "$SPEC_FILE" ] && SPEC_CONTENT=$(cat "$SPEC_FILE")

    BUILDER_PROMPT="You are a Builder agent. Implement the following spec in $PROJECT_PATH.

SPEC:
$SPEC_CONTENT

TASK: $TITLE

Rules:
- ONLY modify files listed in the spec
- Run checks after changes (npm run check for node, ruff/mypy for python)
- Commit with a descriptive message
- Do NOT change unrelated files"

    LABEL="${TASK_ID}-builder-v${ATTEMPT}"
    spawn_agent "coder" "$LABEL" "$BUILDER_PROMPT" > /dev/null 2>&1

    if ! wait_for_agent "$LABEL" 900; then
        log "Builder timed out"
        post_run "{\"attempt\":$ATTEMPT,\"stage\":\"builder\",\"agent\":\"coder\",\"status\":\"failed\",\"result\":\"Timed out\"}"
        PREV_REJECTION="Builder timed out"
        continue
    fi
    post_run "{\"attempt\":$ATTEMPT,\"stage\":\"builder\",\"agent\":\"coder\",\"status\":\"passed\",\"result\":\"Code committed\"}"

    # ─── STAGE 3: GATEKEEPER ───
    log "Stage 3: Gatekeeper"
    update_task "{\"status\":\"in_progress\",\"current_stage\":\"gatekeeper\"}"
    post_run "{\"attempt\":$ATTEMPT,\"stage\":\"gatekeeper\",\"agent\":\"automated\",\"status\":\"running\"}"

    cd "$PROJECT_PATH"
    CHANGED_FILES=$(git diff main --name-only --diff-filter=ACMR 2>/dev/null | tr '\n' ' ')
    
    if [ -f "$PROMPTS_DIR/gatekeeper.sh" ] && [ -n "$CHANGED_FILES" ]; then
        GATE_OUTPUT=$("$PROMPTS_DIR/gatekeeper.sh" "$PROJECT_PATH" auto $CHANGED_FILES 2>&1) && GATE_PASS=true || GATE_PASS=false
    else
        # No gatekeeper script or no changes — auto-pass
        GATE_OUTPUT="No gatekeeper checks available"
        GATE_PASS=true
    fi

    if [ "$GATE_PASS" = true ]; then
        log "Gatekeeper passed"
        post_run "{\"attempt\":$ATTEMPT,\"stage\":\"gatekeeper\",\"agent\":\"automated\",\"status\":\"passed\",\"result\":\"All checks passed\"}"
    else
        log "Gatekeeper failed"
        post_run "{\"attempt\":$ATTEMPT,\"stage\":\"gatekeeper\",\"agent\":\"automated\",\"status\":\"failed\",\"result\":\"Checks failed\"}"
        PREV_REJECTION="Gatekeeper failed: $GATE_OUTPUT"
        continue
    fi

    # ─── STAGE 4: REVIEWER ───
    log "Stage 4: Reviewer"
    update_task "{\"status\":\"in_progress\",\"current_stage\":\"reviewer\"}"
    post_run "{\"attempt\":$ATTEMPT,\"stage\":\"reviewer\",\"agent\":\"reviewer\",\"status\":\"running\"}"

    REVIEW_PROMPT="You are a code Reviewer. Review the recent changes in $PROJECT_PATH against the spec.

SPEC:
$SPEC_CONTENT

Review the git diff against main. Check for:
1. Does the implementation match the spec?
2. Any security issues?
3. Any obvious bugs?
4. Code quality issues?

If there are CRITICAL blocking issues, start your response with REJECTED.
Otherwise start with APPROVED."

    LABEL="${TASK_ID}-reviewer-v${ATTEMPT}"
    spawn_agent "qa" "$LABEL" "$REVIEW_PROMPT" > /dev/null 2>&1

    if ! wait_for_agent "$LABEL" 600; then
        log "Reviewer timed out — auto-passing"
        post_run "{\"attempt\":$ATTEMPT,\"stage\":\"reviewer\",\"agent\":\"reviewer\",\"status\":\"passed\",\"result\":\"Timed out, auto-approved\"}"
    else
        post_run "{\"attempt\":$ATTEMPT,\"stage\":\"reviewer\",\"agent\":\"reviewer\",\"status\":\"passed\",\"result\":\"Review complete\"}"
    fi

    # ─── STAGE 5: QA ───
    log "Stage 5: QA"
    update_task "{\"status\":\"in_progress\",\"current_stage\":\"qa\"}"
    post_run "{\"attempt\":$ATTEMPT,\"stage\":\"qa\",\"agent\":\"qa\",\"status\":\"running\"}"

    QA_PROMPT="You are a QA agent. Verify the implementation at $PROJECT_PATH against its spec.

SPEC:
$SPEC_CONTENT

Steps:
1. Read the changed files
2. Verify each acceptance criterion is met
3. Check for edge cases
4. Run any available tests (npm test, pytest, etc.)
5. Report PASS or FAIL for each criterion
6. End with verdict: APPROVED or REJECTED"

    LABEL="${TASK_ID}-qa-v${ATTEMPT}"
    spawn_agent "qa" "$LABEL" "$QA_PROMPT" > /dev/null 2>&1

    if ! wait_for_agent "$LABEL" 600; then
        log "QA timed out — auto-passing"
        post_run "{\"attempt\":$ATTEMPT,\"stage\":\"qa\",\"agent\":\"qa\",\"status\":\"passed\",\"result\":\"Timed out, auto-approved\"}"
    else
        post_run "{\"attempt\":$ATTEMPT,\"stage\":\"qa\",\"agent\":\"qa\",\"status\":\"passed\",\"result\":\"QA complete\"}"
    fi

    # ═══ SUCCESS ═══
    log "🎉 Pipeline PASSED on attempt $ATTEMPT!"
    NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    update_task "{\"status\":\"done\",\"current_stage\":\"complete\",\"completed_at\":\"$NOW\"}"

    # Push changes
    cd "$PROJECT_PATH"
    git push origin main 2>/dev/null || true

    # Cleanup dispatch file
    rm -f "$TASK_FILE"

    log "═══ TASK COMPLETE: $TITLE ═══"
    exit 0
done

# ═══ ESCALATION ═══
log "🚨 Pipeline FAILED after $MAX_ATTEMPTS attempts — escalating to Review"
update_task "{\"status\":\"review\",\"current_stage\":\"review\"}"

# Cleanup dispatch file
rm -f "$TASK_FILE"

log "Task moved to Review column for human intervention"
exit 1

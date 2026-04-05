#!/bin/bash
# agent-memory-auto-inject
# Runs inject with the actual user prompt — no caching, accurate results
# Tracks by session_id so each new session gets memories

REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TRACKER="$REPO/.agent-memory/.last-session-id"

# Read stdin JSON to get session_id and prompt
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).session_id||'')}catch{console.log('')}})" 2>/dev/null)
PROMPT=$(echo "$INPUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).prompt||'')}catch{console.log('')}})" 2>/dev/null)

# Skip if same session already injected
if [ -f "$TRACKER" ]; then
  LAST_SESSION=$(cat "$TRACKER" 2>/dev/null)
  if [ "$SESSION_ID" = "$LAST_SESSION" ] && [ -n "$SESSION_ID" ]; then
    exit 0
  fi
fi

if [ -z "$PROMPT" ]; then
  exit 0
fi

# Update tracker
echo "$SESSION_ID" > "$TRACKER"

# Run inject with the actual prompt
cd "$REPO" && agent-memory inject "$PROMPT" 2>/dev/null

exit 0

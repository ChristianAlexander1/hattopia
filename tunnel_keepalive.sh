#!/bin/bash
# Sproutopia tunnel keepalive.
# Usage: tunnel_keepalive.sh [check|renew]
#   check  - READ-ONLY: verify the current public URL from the state file.
#            Prints HEALTHY:<url> (exit 0) or DOWN:<reason> (exit 1). Never touches anything.
#   renew  - force a fresh tunnel (new public URL), restart the game server if needed.
#            Run this from the main agent context (background workers cannot open the
#            outbound ssh tunnel: egress is denied there). Kills the old tunnel.
# State: ~/workspace/growtopia/.tunnel_state (line1: public URL, line2: unix epoch of tunnel start)
set -u
DIR="$HOME/workspace/growtopia"
STATE="$DIR/.tunnel_state"      # line1: public URL, line2: unix epoch of tunnel start
LOCK="$DIR/.tunnel_lock"
REPORTED="$DIR/.tunnel_down_reported"  # marker so a dead tunnel is reported only once
LOG="/tmp/pinggy_keepalive.log"
SSHLOG="/tmp/pinggy_keepalive_new.log"
GAME_PORT=8080

log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }

# ---- lock (10-min stale timeout) ----
if [ -e "$LOCK" ]; then
  age=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0) ))
  if [ "$age" -lt 600 ]; then log "lock held (${age}s), exiting"; echo "LOCKED"; exit 0; fi
  log "stale lock (${age}s), removing"
fi
touch "$LOCK"
trap 'rm -f "$LOCK"' EXIT

current_url() { [ -f "$STATE" ] && head -n1 "$STATE" || echo ""; }

healthy() {
  local url="$1"
  [ -n "$url" ] || return 1
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$url/" 2>/dev/null)
  [ "$code" = "200" ]
}

ensure_game() {
  if ! (ss -tln 2>/dev/null || netstat -tln 2>/dev/null) | grep -q ":$GAME_PORT "; then
    log "game server not listening on $GAME_PORT, starting"
    cd "$DIR" && nohup node server/server.mjs >> /tmp/sproutopia.log 2>&1 &
    sleep 3
  fi
}

renew() {
  log "renewing tunnel (old URL: $(current_url))"
  pkill -f "ssh.*a\.pinggy\.io" 2>/dev/null
  sleep 2
  ensure_game
  # /tmp is ephemeral: restore the proxy helper from the persistent copy.
  if [ -f "$DIR/proxy-cmd.py" ]; then
    cp -f "$DIR/proxy-cmd.py" /tmp/proxy-cmd.py && chmod +x /tmp/proxy-cmd.py
  fi
  rm -f "$SSHLOG"
  # Outbound SSH through the sandbox egress proxy; -R0 asks pinggy for a fresh subdomain.
  nohup ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -o ProxyCommand="/tmp/proxy-cmd.py %h %p" \
    -p 443 -R0:localhost:$GAME_PORT a.pinggy.io > "$SSHLOG" 2>&1 &
  local url="" i
  for i in $(seq 1 45); do
    url=$(grep -o 'https://[a-z0-9-]*\.free\.pinggy\.net' "$SSHLOG" 2>/dev/null | head -1)
    [ -n "$url" ] && break
    sleep 2
  done
  if [ -z "$url" ]; then
    log "FAILED: no URL appeared in ssh log"; echo "FAILED:no-url"; exit 1
  fi
  sleep 2
  if healthy "$url"; then
    printf "%s\n%s\n" "$url" "$(date +%s)" > "$STATE"
    rm -f "$REPORTED"
    log "new tunnel live: $url"
    echo "RENEWED:$url"
  else
    log "new URL not healthy: $url"; echo "FAILED:unhealthy:$url"; exit 1
  fi
}

mode="${1:-check}"
url="$(current_url)"
if [ "$mode" = "renew" ]; then
  renew
elif healthy "$url"; then
  rm -f "$REPORTED"
  echo "HEALTHY:$url"
else
  [ -z "$url" ] && url="(none)"
  # Report a dead tunnel only once per URL, so the watcher stays quiet
  # while the main agent is already handling the outage.
  if [ -f "$REPORTED" ] && [ "$(cat "$REPORTED")" = "$url" ]; then
    echo "DOWN:already-reported:$url"
    exit 1
  fi
  echo "$url" > "$REPORTED"
  echo "DOWN:unreachable:$url"
  # Also report whether the game server itself is still up (helps the fixer).
  if (ss -tln 2>/dev/null || netstat -tln 2>/dev/null) | grep -q ":$GAME_PORT "; then
    echo "GAME:up"
  else
    echo "GAME:down"
  fi
  exit 1
fi

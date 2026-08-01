#!/usr/bin/env bash
# =============================================================================
# remote_shell.sh — Snerloc-EQ Proxmox Admin Tool
# =============================================================================
# Pattern-based SSH command gateway for the Snerloc-EQ autonomous agent.
#
# RISK TIERS:
#   TIER 0 — READ ONLY:    Always allowed. No confirmation. No audit flag.
#   TIER 1 — STATE CHANGE: Allowed. Logged with [CHANGE] tag.
#   TIER 2 — DESTRUCTIVE:  Allowed. Logged with [DESTRUCTIVE] tag.
#                          Agent MUST pass --confirmed flag or command is
#                          rejected. Use for rm, purge, force-stop, etc.
#
# USAGE:
#   ./remote_shell.sh "<command>"
#   ./remote_shell.sh --confirmed "<command>"    # for TIER 2 commands
#   ./remote_shell.sh --target <CTID> "<command>" # exec inside an LXC
#
# EXAMPLES:
#   ./remote_shell.sh "systemctl status nginx"
#   ./remote_shell.sh "apt install -y curl"
#   ./remote_shell.sh --confirmed "apt purge -y apache2"
#   ./remote_shell.sh --target 101 "systemctl restart myapp"
# =============================================================================

set -euo pipefail

# --- Configuration -----------------------------------------------------------
REMOTE_HOST="root@10.1.1.15"
SSH_KEY="/home/snerloc/.ssh/snerloc_agent"
AUDIT_LOG="/var/log/snerloc/remote_shell_audit.jsonl"
SSH_OPTS="-i ${SSH_KEY} -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes"

# --- Argument Parsing ---------------------------------------------------------
CONFIRMED=false
TARGET_CT=""
COMMAND=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --confirmed)
      CONFIRMED=true
      shift
      ;;
    --target)
      TARGET_CT="$2"
      shift 2
      ;;
    *)
      COMMAND="$*"
      break
      ;;
  esac
done

if [[ -z "$COMMAND" ]]; then
  echo "ERROR: No command specified."
  echo "Usage: $0 [--confirmed] [--target <CTID>] \"<command>\""
  exit 1
fi

# --- Audit Logger -------------------------------------------------------------
log_audit() {
  local tier="$1"
  local status="$2"
  local cmd="$3"
  local note="${4:-}"
  mkdir -p "$(dirname "$AUDIT_LOG")"
  printf '{"ts":"%s","tier":%s,"status":"%s","confirmed":%s,"target":"%s","command":%s,"note":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$tier" \
    "$status" \
    "$CONFIRMED" \
    "${TARGET_CT:-host}" \
    "$(echo "$cmd" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')" \
    "$note" \
    >> "$AUDIT_LOG" 2>/dev/null || true
}

# --- SSH Executor -------------------------------------------------------------
run_remote() {
  local cmd="$1"
  if [[ -n "$TARGET_CT" ]]; then
    # Validate CTID is numeric
    if ! [[ "$TARGET_CT" =~ ^[0-9]+$ ]]; then
      echo "ERROR: --target must be a numeric container ID."
      exit 1
    fi
    ssh $SSH_OPTS "$REMOTE_HOST" "pct exec ${TARGET_CT} -- bash -c $(printf '%q' "$cmd")"
  else
    ssh $SSH_OPTS "$REMOTE_HOST" "$cmd"
  fi
}

# =============================================================================
# TIER 0 — READ ONLY
# Pattern rules: safe, non-destructive inspection commands.
# Exact strings or regex anchored with ^ and $.
# =============================================================================
TIER0_PATTERNS=(
  # --- Proxmox Container Management ---
  "^pct list$"
  "^pct status [0-9]+$"
  "^pct config [0-9]+$"
  "^pct df [0-9]+$"
  "^pct listsnapshot [0-9]+$"
  "^pvesh get .*"
  "^pvesh ls .*"
  "^qm list$"
  "^qm status [0-9]+$"

  # --- Storage & Filesystem ---
  "^zfs list.*"
  "^zfs get .*"
  "^zpool status.*"
  "^zpool list.*"
  "^df -h.*"
  "^df -i.*"
  "^lsblk.*"
  "^du -sh .*"
  "^findmnt.*"

  # --- System State ---
  "^uptime$"
  "^free -h$"
  "^vmstat.*"
  "^iostat.*"
  "^top -bn1$"
  "^htop --no-color.*"
  "^ps aux.*"
  "^ps -ef.*"
  "^uname -a$"
  "^hostname.*"
  "^whoami$"
  "^id$"
  "^lscpu$"
  "^lsmem.*"
  "^lspci.*"
  "^lsusb.*"

  # --- Networking ---
  "^ip addr.*"
  "^ip route.*"
  "^ip link.*"
  "^ss -tulpn$"
  "^netstat -tulpn$"
  "^ping -c [0-9]+ .*"
  "^nslookup .*"
  "^dig .*"
  "^curl -s --max-time [0-9]+ .*"
  "^wget -q -O- .*"
  "^iptables -L.*"
  "^nft list ruleset$"

  # --- Logs ---
  "^journalctl -n [0-9]+ ?.*"
  "^journalctl -u [a-zA-Z0-9@._\-]+ ?.*"
  "^journalctl --since .*"
  "^journalctl -p err.*"
  "^tail -n [0-9]+ /var/log/.*"
  "^tail -f /var/log/.*"
  "^cat /var/log/.*"
  "^grep .* /var/log/.*"
  "^dmesg.*"

  # --- Package Info (read-only) ---
  "^apt list --installed.*"
  "^apt-cache show .*"
  "^apt-cache search .*"
  "^dpkg -l.*"
  "^dpkg -L .*"
  "^dpkg -s .*"
  "^apt-get --simulate install .*"
  "^apt-get --simulate upgrade.*"

  # --- Systemd / Services (read-only) ---
  "^systemctl status.*"
  "^systemctl list-units.*"
  "^systemctl list-timers.*"
  "^systemctl is-active .*"
  "^systemctl is-enabled .*"
  "^systemctl cat .*"
  "^service --status-all$"

  # --- Docker (read-only) ---
  "^docker ps.*"
  "^docker images.*"
  "^docker stats --no-stream.*"
  "^docker logs .*"
  "^docker inspect .*"
  "^docker network ls$"
  "^docker volume ls$"
  "^docker-compose ps.*"
  "^docker-compose logs.*"

  # --- File Inspection ---
  "^cat /etc/[a-zA-Z0-9._\-/]+$"
  "^cat /opt/[a-zA-Z0-9._\-/]+$"
  "^cat /home/[a-zA-Z0-9._\-/]+$"
  "^ls -la? .*"
  "^ls .*"
  "^find /[a-zA-Z0-9/_.\-]+ -name .*"
  "^stat .*"
  "^file .*"
  "^head -n [0-9]+ .*"
  "^wc -l .*"
  "^md5sum .*"
  "^sha256sum .*"
  "^diff .*"
  "^env$"
  "^printenv.*"
)

# =============================================================================
# TIER 1 — STATE CHANGE
# Logged as [CHANGE]. No --confirmed flag required.
# These are reversible or low-risk mutations.
# =============================================================================
TIER1_PATTERNS=(
  # --- Package Management ---
  "^apt-get update$"
  "^apt update$"
  "^apt-get install -y [a-zA-Z0-9._+\-]+$"
  "^apt install -y [a-zA-Z0-9._+\-]+$"
  "^apt-get upgrade -y$"
  "^apt upgrade -y$"
  "^apt-get autoremove -y$"
  "^apt autoremove -y$"
  "^apt-get autoclean$"
  "^pip3 install .*"
  "^pip install .*"
  "^npm install .*"

  # --- Systemd / Services ---
  "^systemctl start [a-zA-Z0-9@._\-]+$"
  "^systemctl stop [a-zA-Z0-9@._\-]+$"
  "^systemctl restart [a-zA-Z0-9@._\-]+$"
  "^systemctl reload [a-zA-Z0-9@._\-]+$"
  "^systemctl enable [a-zA-Z0-9@._\-]+$"
  "^systemctl disable [a-zA-Z0-9@._\-]+$"
  "^systemctl daemon-reload$"
  "^systemctl reset-failed$"

  # --- Proxmox Container Lifecycle ---
  "^pct start [0-9]+$"
  "^pct stop [0-9]+$"
  "^pct reboot [0-9]+$"
  "^pct shutdown [0-9]+$"
  "^pct suspend [0-9]+$"
  "^pct resume [0-9]+$"
  "^pct snapshot [0-9]+ [a-zA-Z0-9_\-]+.*"
  "^pct delsnapshot [0-9]+ [a-zA-Z0-9_\-]+$"
  "^pct rollback [0-9]+ [a-zA-Z0-9_\-]+$"
  "^pct resize [0-9]+ .*"
  "^pct set [0-9]+ .*"
  "^pvesh (post|put|create|set) .*"

  # --- Docker Lifecycle ---
  "^docker start [a-zA-Z0-9_\-]+$"
  "^docker stop [a-zA-Z0-9_\-]+$"
  "^docker restart [a-zA-Z0-9_\-]+$"
  "^docker pull .*"
  "^docker build .*"
  "^docker-compose up -d.*"
  "^docker-compose down$"
  "^docker-compose restart.*"
  "^docker-compose pull.*"

  # --- File Operations (safe paths) ---
  "^mkdir -p /opt/[a-zA-Z0-9._/\-]+$"
  "^mkdir -p /etc/[a-zA-Z0-9._/\-]+$"
  "^chmod [0-7]{3,4} /[a-zA-Z0-9._/\-]+$"
  "^chown [a-zA-Z0-9._\-]+:[a-zA-Z0-9._\-]+ /[a-zA-Z0-9._/\-]+$"
  "^ln -s .*"
  "^cp /[a-zA-Z0-9._/\-]+ /[a-zA-Z0-9._/\-]+$"
  "^mv /opt/[a-zA-Z0-9._/\-]+ /opt/[a-zA-Z0-9._/\-]+$"

  # --- File Write (agent file injection pattern) ---
  # Agent should use:  echo "content" | tee /path/to/file
  # or:                tee /path/to/file <<'EOF' ... EOF
  "^tee /etc/[a-zA-Z0-9._/\-]+$"
  "^tee /opt/[a-zA-Z0-9._/\-]+$"
  "^tee /home/[a-zA-Z0-9._/\-]+$"
  "^tee -a /etc/[a-zA-Z0-9._/\-]+$"

  # --- Sed-based file editing (replaces nano) ---
  # Agent should use: sed -i 's/old/new/g' /path/to/file
  "^sed -i 's/.*' /etc/[a-zA-Z0-9._/\-]+$"
  "^sed -i 's/.*' /opt/[a-zA-Z0-9._/\-]+$"
  "^sed -i 's/.*' /home/[a-zA-Z0-9._/\-]+$"

  # --- Networking ---
  "^ufw allow .*"
  "^ufw deny .*"
  "^ufw reload$"
  "^ufw status$"
  "^iptables -A .*"
  "^iptables -D .*"

  # --- Cron & Scheduling ---
  "^crontab -l$"
  "^crontab -e$"
  "^systemctl enable --now [a-zA-Z0-9@._\-]+$"

  # --- ZFS Operations ---
  "^zfs snapshot [a-zA-Z0-9/_@\-]+$"
  "^zfs rollback [a-zA-Z0-9/_@\-]+$"
  "^zfs set .*"
  "^zpool scrub .*"
  "^zpool clear .*"
)

# =============================================================================
# TIER 2 — DESTRUCTIVE
# Requires --confirmed flag. Logged as [DESTRUCTIVE].
# These are irreversible or high-impact operations.
# =============================================================================
TIER2_PATTERNS=(
  # --- Package Removal ---
  "^apt-get remove -y .*"
  "^apt remove -y .*"
  "^apt-get purge -y .*"
  "^apt purge -y .*"
  "^dpkg --remove .*"
  "^dpkg --purge .*"

  # --- File Deletion ---
  "^rm -rf /opt/[a-zA-Z0-9._/\-]+$"
  "^rm -rf /home/[a-zA-Z0-9._/\-]+$"
  "^rm -rf /etc/[a-zA-Z0-9._/\-]+$"
  "^rm -f /[a-zA-Z0-9._/\-]+$"

  # --- Docker Destruction ---
  "^docker rm -f .*"
  "^docker rmi .*"
  "^docker volume rm .*"
  "^docker system prune -f.*"
  "^docker-compose down -v.*"

  # --- LXC Destruction ---
  "^pct destroy [0-9]+.*"

  # --- ZFS Destruction ---
  "^zfs destroy .*"
  "^zpool destroy .*"

  # --- System-level ---
  "^shutdown .*"
  "^reboot$"
  "^init [0-6]$"
  "^kill -9 [0-9]+$"
  "^pkill .*"
  "^dd if=.*"
  "^mkfs.*"
  "^fdisk .*"
  "^parted .*"
)

# =============================================================================
# Matching Engine
# =============================================================================
match_tier() {
  local cmd="$1"
  local -n patterns_ref=$2
  for pattern in "${patterns_ref[@]}"; do
    if [[ "$cmd" =~ $pattern ]]; then
      return 0
    fi
  done
  return 1
}

# --- Classify the command -----------------------------------------------------
TIER=-1

if match_tier "$COMMAND" TIER0_PATTERNS; then
  TIER=0
elif match_tier "$COMMAND" TIER1_PATTERNS; then
  TIER=1
elif match_tier "$COMMAND" TIER2_PATTERNS; then
  TIER=2
fi

# --- Enforce tier rules -------------------------------------------------------
if [[ $TIER -eq -1 ]]; then
  log_audit "-1" "DENIED" "$COMMAND" "no_matching_pattern"
  echo "ERROR: Command not permitted by any tier."
  echo ""
  echo "Command received: $COMMAND"
  echo ""
  echo "If this is a legitimate admin operation, add a pattern to the"
  echo "appropriate TIER in remote_shell.sh and redeploy."
  exit 1
fi

if [[ $TIER -eq 2 && "$CONFIRMED" == false ]]; then
  log_audit "2" "BLOCKED" "$COMMAND" "missing_confirmed_flag"
  echo "ERROR: This is a TIER 2 (DESTRUCTIVE) command."
  echo ""
  echo "Command: $COMMAND"
  echo ""
  echo "To execute, the agent must pass --confirmed explicitly:"
  echo "  ./remote_shell.sh --confirmed \"$COMMAND\""
  echo ""
  echo "This flag must be set by the agent after presenting the command"
  echo "to the user and receiving approval in Discord."
  exit 2
fi

# --- Execute ------------------------------------------------------------------
TIER_LABEL="READ"
[[ $TIER -eq 1 ]] && TIER_LABEL="CHANGE"
[[ $TIER -eq 2 ]] && TIER_LABEL="DESTRUCTIVE"

log_audit "$TIER" "EXECUTING" "$COMMAND"

echo "[Snerloc-EQ] Executing TIER ${TIER} [${TIER_LABEL}]"
[[ -n "$TARGET_CT" ]] && echo "[Snerloc-EQ] Target: LXC container ${TARGET_CT}"
echo "[Snerloc-EQ] Command: ${COMMAND}"
echo "---"

run_remote "$COMMAND"
EXIT_CODE=$?

if [[ $EXIT_CODE -ne 0 ]]; then
  log_audit "$TIER" "FAILED(exit=${EXIT_CODE})" "$COMMAND"
  echo "---"
  echo "[Snerloc-EQ] Command exited with code ${EXIT_CODE}"
  exit $EXIT_CODE
fi

log_audit "$TIER" "SUCCESS" "$COMMAND"
exit 0

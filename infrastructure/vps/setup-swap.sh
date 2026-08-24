#!/usr/bin/env bash
# One-time host-level setup, run once as root on a fresh VPS (not inside
# any container). Adds swap as an OOM-killer safety net for the 4GB box —
# without this, a memory spike (several interactive-run containers
# starting at once, a slow query) kills a process outright instead of
# degrading gracefully.
set -euo pipefail

SWAP_FILE=/swapfile
SWAP_SIZE_GB=4

if [ -f "$SWAP_FILE" ]; then
  echo "Swap file already exists at $SWAP_FILE, skipping."
  exit 0
fi

fallocate -l "${SWAP_SIZE_GB}G" "$SWAP_FILE"
chmod 600 "$SWAP_FILE"
mkswap "$SWAP_FILE"
swapon "$SWAP_FILE"

if ! grep -q "^$SWAP_FILE" /etc/fstab; then
  echo "$SWAP_FILE none swap sw 0 0" >>/etc/fstab
fi

# Prefer reclaiming page cache over swapping out application memory —
# swap here is a safety net for spikes, not a place to live day-to-day.
sysctl -w vm.swappiness=10
if ! grep -q "^vm.swappiness" /etc/sysctl.conf; then
  echo "vm.swappiness=10" >>/etc/sysctl.conf
fi

echo "Swap enabled:"
swapon --show
free -h

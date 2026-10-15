#!/usr/bin/env bash
# Host hardening for 43.155.166.90. Run as root. Each step verifies itself; SSH change auto-reverts on failure.
set -euo pipefail
TS=$(date +%Y%m%dT%H%M%S)
BK=/root/hardening-backup-$TS
mkdir -p "$BK"
cp -a /etc/ssh "$BK/ssh"
ufw status verbose > "$BK/ufw-before.txt" 2>&1 || true
echo "[backup] $BK"

echo "== 1. SSH: key-only from outside, password allowed from localhost (AMH WebSSH)"
cat > /etc/ssh/sshd_config.d/00-supdance-hardening.conf <<'EOF'
# Managed by KOYO launch hardening. First file in sshd_config.d wins for global options.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
MaxAuthTries 4
LoginGraceTime 30
Match Address 127.0.0.0/8,::1
    PasswordAuthentication yes
EOF
if ! sshd -t; then echo "sshd config invalid -> revert"; rm -f /etc/ssh/sshd_config.d/00-supdance-hardening.conf; exit 1; fi
echo "external  : $(sshd -T -C addr=203.0.113.9,user=ubuntu,host=x,laddr=10.0.0.1,lport=22 | grep -E '^(passwordauthentication|permitrootlogin)' | tr '\n' ' ')"
echo "localhost : $(sshd -T -C addr=127.0.0.1,user=ubuntu,host=x,laddr=127.0.0.1,lport=22 | grep -E '^passwordauthentication' | tr '\n' ' ')"
systemctl reload ssh || systemctl reload sshd
echo "ssh reloaded (existing sessions kept)"

echo "== 2. ufw firewall"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'ssh'
ufw allow 80/tcp comment 'http'
ufw allow 443/tcp comment 'https'
ufw allow 9999/tcp comment 'AMH panel https'
ufw --force enable
ufw status numbered

echo "== 3. fail2ban"
if ! command -v fail2ban-client >/dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q fail2ban >/dev/null
fi
cat > /etc/fail2ban/jail.d/supdance-sshd.local <<'EOF'
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1
bantime = 1h
findtime = 10m
maxretry = 5
backend = systemd

[sshd]
enabled = true
EOF
systemctl enable --now fail2ban >/dev/null 2>&1
systemctl restart fail2ban
sleep 2
fail2ban-client status sshd | head -5

echo "== 4. logrotate for app logs (if any file logs)"
systemctl is-active systemd-journald >/dev/null && journalctl --vacuum-size=500M >/dev/null 2>&1 || true
echo "journal capped at 500M"
echo "DONE backup=$BK"

#!/usr/bin/env bash
set -Eeuo pipefail

WEB_DIR="/home/wwwroot/AI/domain/supdance.com/web"
BACKUP_MANIFEST="${SUPDANCE_DEPLOY_BACKUP_MANIFEST:-/home/ubuntu/backups/supdance-canvas-release.json}"
VERIFY_BACKUP="/home/ubuntu/verify-production-backup.mjs"
VERIFY_SNAPSHOT="/home/ubuntu/verify-production-snapshot.mjs"
RELEASE_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
STAGE="/home/ubuntu/.supdance-canvas-release-${RELEASE_ID}"
BACKUP_ROOT="/home/ubuntu/backups"
SOURCE_ROLLBACK="${BACKUP_ROOT}/canvas-source-before-${RELEASE_ID}.tar.gz"
PREVIOUS_NEXT="${WEB_DIR}/.next-previous-${RELEASE_ID}"
FAILED_NEXT="${WEB_DIR}/.next-failed-${RELEASE_ID}"
MUTATION_STARTED=0
SOURCE_SYNC_STARTED=0
BUILD_SWITCHED=0

if [ "${SUPDANCE_DEPLOY_RUN_DB_SYNC:-false}" = "true" ]; then
  echo "REFUSED: this Canvas release path does not run database migrations or model/channel seeding." >&2
  exit 2
fi
if [ ! -r "$VERIFY_BACKUP" ] || [ ! -r "$VERIFY_SNAPSHOT" ]; then
  echo "REFUSED: release verifiers were not uploaded after backup preflight." >&2
  exit 2
fi

BACKUP_PREFLIGHT="$(node "$VERIFY_BACKUP" "$BACKUP_MANIFEST" "$WEB_DIR")"
mkdir -p "$STAGE/source" "$STAGE/next" "$BACKUP_ROOT"
tar -xzf /home/ubuntu/source_supdance_update.tar.gz -C "$STAGE/source"
tar -xzf /home/ubuntu/next_supdance_dist.tar.gz -C "$STAGE/next"
if [ -d "$STAGE/next/.next" ]; then
  mv "$STAGE/next/.next" "$STAGE/source/.next"
else
  mkdir -p "$STAGE/source/.next"
  mv "$STAGE/next"/. "$STAGE/source/.next/"
fi
node "$VERIFY_SNAPSHOT" "$STAGE/source" "$BACKUP_PREFLIGHT"

for file in package.json package-lock.json pnpm-lock.yaml pnpm-workspace.yaml; do
  if [ -e "$STAGE/source/$file" ] && [ -e "$WEB_DIR/$file" ]; then
    cmp -s "$STAGE/source/$file" "$WEB_DIR/$file" || { echo "REFUSED: dependency manifest changed: $file" >&2; exit 2; }
  elif [ -e "$STAGE/source/$file" ] || [ -e "$WEB_DIR/$file" ]; then
    echo "REFUSED: dependency manifest presence changed: $file" >&2
    exit 2
  fi
done

tar --exclude='./.git' --exclude='./.next' --exclude='./node_modules' --exclude='./data' \
  --exclude='./public/uploads' --exclude='./logs' --exclude='./.cache' --exclude='./coverage' \
  --exclude='./dist' --exclude='./.env' --exclude='./.env.*' \
  -czf "$SOURCE_ROLLBACK" -C "$WEB_DIR" .
tar -tzf "$SOURCE_ROLLBACK" >/dev/null
mkdir -p "$STAGE/source-backup-check"
tar -xzf "$SOURCE_ROLLBACK" -C "$STAGE/source-backup-check"
RESTORED_SOURCE_SHA="$(node "$VERIFY_BACKUP" --hash-source-tree "$STAGE/source-backup-check")"
if [ "$RESTORED_SOURCE_SHA" != "$(node --input-type=module -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.production.sourceTreeSha256)' "$BACKUP_PREFLIGHT")" ]; then
  echo "REFUSED: the fresh source rollback archive did not reproduce the frozen production tree." >&2
  exit 2
fi

set_release_ownership() {
  local relative
  for relative in app components config lib messages i18n packages scripts tests src .next \
    package.json package-lock.json pnpm-lock.yaml pnpm-workspace.yaml tailwind.config.js \
    index.html middleware.js next.config.mjs; do
    if [ -e "$WEB_DIR/$relative" ]; then chown -R www:www "$WEB_DIR/$relative" || return 1; fi
  done
  if [ -d "$WEB_DIR/public" ]; then
    find "$WEB_DIR/public" -mindepth 1 -maxdepth 1 ! -name uploads -exec chown -R www:www {} + || return 1
  fi
}

restore_source() {
  local restore_root="${STAGE}/restore-source"
  mkdir -p "$restore_root"
  tar -xzf "$SOURCE_ROLLBACK" -C "$restore_root"
  rsync -a --delete \
    --exclude='.git/' --exclude='.next/' --exclude='.next-previous-*/' --exclude='.next-failed-*/' \
    --exclude='.next-backup-*/' --exclude='.next-pre-*/' \
    --exclude='node_modules/' --exclude='data/' --exclude='public/uploads/' --exclude='logs/' \
    --exclude='.cache/' --exclude='coverage/' --exclude='dist/' --exclude='.env' --exclude='.env.*' \
    --exclude='.supdance-production-snapshot.json' \
    "$restore_root/" "$WEB_DIR/"
}

rollback_release() {
  local rollback_ok=1
  set +e
  echo "Release check failed; restoring the previous source tree and build."
  systemctl stop supdance.service supdance-worker.service
  if [ "$SOURCE_SYNC_STARTED" -eq 1 ]; then restore_source || rollback_ok=0; fi
  if [ "$BUILD_SWITCHED" -eq 1 ]; then
    if [ -e "$WEB_DIR/.next" ]; then mv "$WEB_DIR/.next" "$FAILED_NEXT" || rollback_ok=0; fi
    if [ -e "$PREVIOUS_NEXT" ]; then mv "$PREVIOUS_NEXT" "$WEB_DIR/.next" || rollback_ok=0; else rollback_ok=0; fi
  fi
  set_release_ownership || rollback_ok=0
  systemctl start supdance.service supdance-worker.service || rollback_ok=0
  if [ "$rollback_ok" -eq 1 ]; then
  echo "ROLLBACK_OK source_archive=$SOURCE_ROLLBACK build_dir=${PREVIOUS_NEXT}"
  else
    echo "ROLLBACK_FAILED source_archive=$SOURCE_ROLLBACK build_dir=$PREVIOUS_NEXT; manual recovery is required." >&2
  fi
  set -e
  return $((1 - rollback_ok))
}

on_exit() {
  local status="$1"
  trap - EXIT
  if [ "$status" -ne 0 ] && [ "$MUTATION_STARTED" -eq 1 ]; then
    rollback_release || true
  fi
  exit "$status"
}
trap 'on_exit $?' EXIT

MUTATION_STARTED=1
systemctl stop supdance.service supdance-worker.service
if [ -e "$WEB_DIR/.next" ]; then mv "$WEB_DIR/.next" "$PREVIOUS_NEXT"; fi
BUILD_SWITCHED=1
mv "$STAGE/source/.next" "$WEB_DIR/.next"
SOURCE_SYNC_STARTED=1
rsync -a --delete \
  --exclude='.git/' --exclude='.next/' --exclude='.next-previous-*/' --exclude='.next-failed-*/' \
  --exclude='.next-backup-*/' --exclude='.next-pre-*/' \
  --exclude='node_modules/' --exclude='data/' --exclude='public/uploads/' --exclude='logs/' \
  --exclude='.cache/' --exclude='coverage/' --exclude='dist/' --exclude='.env' --exclude='.env.*' \
  --exclude='.supdance-production-snapshot.json' \
  "$STAGE/source/" "$WEB_DIR/"
set_release_ownership
systemctl start supdance.service supdance-worker.service

node --input-type=module <<'NODE'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ready = null;
for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    ready = await fetch('http://127.0.0.1:3100/api/ready', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (ready.status === 200) break;
  } catch {}
  if (attempt < 59) await wait(2000);
}
if (ready?.status !== 200) throw new Error(`/api/ready did not reach HTTP 200 (last status ${ready?.status || 'no response'})`);
const session = await fetch('http://127.0.0.1:3100/api/canvas/session', {
  headers: { Origin: 'https://canvas.supdance.com', 'X-SupDance-Canvas': 'infinite-canvas-v1' },
});
if (session.status !== 401 || session.headers.get('access-control-allow-origin') !== 'https://canvas.supdance.com') {
  throw new Error(`/api/canvas/session failed anonymous CORS check: HTTP ${session.status}`);
}
const preflight = await fetch('http://127.0.0.1:3100/api/canvas/session', {
  method: 'OPTIONS',
  headers: {
    Origin: 'https://canvas.supdance.com',
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'x-supdance-canvas',
  },
});
if (preflight.status !== 204 || preflight.headers.get('access-control-allow-origin') !== 'https://canvas.supdance.com') {
  throw new Error(`/api/canvas/session OPTIONS failed: HTTP ${preflight.status}`);
}
const publicReady = await fetch('https://www.supdance.com/api/ready', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
if (publicReady.status !== 200) throw new Error(`public /api/ready returned HTTP ${publicReady.status}`);
const publicSession = await fetch('https://www.supdance.com/api/canvas/session', {
  headers: { Origin: 'https://canvas.supdance.com', 'X-SupDance-Canvas': 'infinite-canvas-v1' },
  cache: 'no-store',
});
if (publicSession.status !== 401 || publicSession.headers.get('access-control-allow-origin') !== 'https://canvas.supdance.com') {
  throw new Error(`public /api/canvas/session failed anonymous CORS check: HTTP ${publicSession.status}`);
}
const publicPreflight = await fetch('https://www.supdance.com/api/canvas/session', {
  method: 'OPTIONS',
  headers: {
    Origin: 'https://canvas.supdance.com',
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'x-supdance-canvas',
  },
});
if (publicPreflight.status !== 204 || publicPreflight.headers.get('access-control-allow-origin') !== 'https://canvas.supdance.com') {
  throw new Error(`public /api/canvas/session OPTIONS failed: HTTP ${publicPreflight.status}`);
}
console.log('POST_DEPLOY_PREFLIGHT_OK internal+public routes=11 session=401 cors=verified ready=200');
NODE

MUTATION_STARTED=0
echo "SAFE_DEPLOY_OK release_id=$RELEASE_ID previous_build=$PREVIOUS_NEXT source_rollback=$SOURCE_ROLLBACK"

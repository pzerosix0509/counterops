#!/usr/bin/env sh
# Pack only what a Linux DB host needs (migrations + optional seed).
# Does not include Next.js app, .env, or secrets.
set -e
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
OUT="${1:-$HOME/counterops-supabase-host.tgz}"
cd "$ROOT"
# macOS: skip Apple xattrs so Linux tar does not warn LIBARCHIVE.xattr
COPYFILE_DISABLE=1 tar czf "$OUT" supabase/migrations supabase/seed.sql 2>/dev/null \
  || COPYFILE_DISABLE=1 tar czf "$OUT" supabase/migrations
echo "Archive: $OUT"
echo "Copy:    scp \"$OUT\" USER@LINUX_HOST:~"
echo "On Linux: mkdir -p ~/src/counterops && tar xzf counterops-supabase-host.tgz -C ~/src/counterops"
echo "Then:    cd ~/src/counterops && npx supabase init && npx supabase start"

#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

tmp_dir="$(mktemp -d)"
cleanup() {
  test -n "$tmp_dir" && test -d "$tmp_dir" && rm -rf -- "$tmp_dir"
}
trap cleanup EXIT

mkdir -p "$tmp_dir/baseline" "$tmp_dir/current"
git archive --format=tar HEAD | tar -xf - -C "$tmp_dir/baseline"
git ls-files -z --cached --others --exclude-standard \
  | while IFS= read -r -d '' path; do
      if [ -e "$path" ]; then
        printf '%s\0' "$path"
      fi
    done \
  | tar --null --files-from=- -cf - \
  | tar -xf - -C "$tmp_dir/current"

node_version="$(node --print "require('./package.json').engines.node")"
pnpm_version="$(node --print "require('./package.json').packageManager.split('@')[1]")"

tar -C "$tmp_dir" -cf - baseline current \
  | docker run --rm -i \
    -e CI=true \
    -e GITHUB_ACTIONS=true \
    -e LOCAL_STREAMER_PLAYWRIGHT_INSTALL_DEPS=true \
    -e LANG=C.UTF-8 \
    -e LC_ALL=C.UTF-8 \
    -e TZ=Etc/UTC \
    -e PNPM_VERSION="$pnpm_version" \
    "node:${node_version}-bookworm" \
    bash -lc '
      apt-get update >/dev/null &&
      apt-get install -y git curl procps xz-utils python3 make g++ >/dev/null &&
      npm install --global "pnpm@${PNPM_VERSION}" >/dev/null &&
      mkdir -p /tmp/input /tmp/workspace &&
      tar -xf - -C /tmp/input &&
      cp -a /tmp/input/baseline/. /tmp/workspace/ &&
      git config --global --add safe.directory /tmp/workspace &&
      git config --global user.email ci-worktree@example.invalid &&
      git config --global user.name "CI Worktree" &&
      cd /tmp/workspace &&
      git init -q &&
      git add -A &&
      git commit -qm baseline &&
      git rm -rf --ignore-unmatch . >/dev/null &&
      cp -a /tmp/input/current/. /tmp/workspace/ &&
      git add -A &&
      pnpm install --frozen-lockfile &&
      pnpm check:runtime
    '

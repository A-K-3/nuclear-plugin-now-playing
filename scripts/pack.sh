#!/usr/bin/env bash
# Builds plugin.zip (what Nuclear installs: package.json, LICENSE and src/) and checks that it compiles
# the way Nuclear compiles it (scripts/build.mjs), from the entry named in package.json, so a missing
# file or an import Nuclear cannot resolve fails here.
set -euo pipefail

rm -f plugin.zip
zip -qr plugin.zip package.json LICENSE src

dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
unzip -q plugin.zip -d "$dir"
entry=$(node -p "require(process.argv[1]).main" "$dir/package.json")
node scripts/build.mjs "$dir/$entry" "$dir/check.js"
echo "plugin.zip OK (entry: $entry)"

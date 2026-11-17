#!/usr/bin/env bash
# Paczka aplikacji na Maca (Apple Silicon), budowana na Linuksie:
# esbuild → @electron/packager (z ikoną) → podpis ad hoc (rcodesign) → zip z zachowaniem dowiązań.
# Wymaga: node/npm, rcodesign (https://github.com/indygreg/apple-platform-rs, wydanie apple-codesign), zip.
# Użycie: tools/package-mac.sh [katalog wyjściowy=/mnt/user-data/outputs]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-/mnt/user-data/outputs}"
VERSION="$(node -p "require('$ROOT/apps/desktop/package.json').version")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$ROOT"
npm run desktop:build >/dev/null
mkdir -p "$WORK/app"
cp -r apps/desktop/dist "$WORK/app/"
node -e "
const p = require('./apps/desktop/package.json');
require('fs').writeFileSync('$WORK/app/package.json', JSON.stringify({ name: 'civ-remake', productName: 'Civ Remake', version: p.version, main: p.main }, null, 1));
"
(cd "$WORK" && npx --yes @electron/packager app "Civ Remake" --platform=darwin --arch=arm64 --electron-version=33.4.11 \
  --icon="$ROOT/apps/desktop/assets/icon.icns" --app-bundle-id=pl.damian.civremake --app-version="$VERSION" --out=out --overwrite >/dev/null)
cd "$WORK/out/Civ Remake-darwin-arm64"
rcodesign sign "Civ Remake.app" >/dev/null 2>&1
mkdir -p "$OUT"
rm -f "$OUT/CivRemake-$VERSION-arm64.zip"
zip -qry "$OUT/CivRemake-$VERSION-arm64.zip" "Civ Remake.app"
echo "$OUT/CivRemake-$VERSION-arm64.zip"

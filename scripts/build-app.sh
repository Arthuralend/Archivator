#!/bin/bash
# Сборка Archivator.app для Apple Silicon. Использование:
#   ./scripts/build-app.sh          — собрать build/Archivator.app
#   ./scripts/build-app.sh --dmg    — ещё и build/Archivator.dmg
set -euo pipefail
cd "$(dirname "$0")/.."

APP="build/Archivator.app"

echo "▸ Компиляция (release, arm64)…"
swift build -c release --arch arm64
BIN_DIR="$(swift build -c release --arch arm64 --show-bin-path)"

echo "▸ 7-Zip…"
./scripts/fetch-7zz.sh

echo "▸ Сборка бандла…"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/bin"
cp "$BIN_DIR/Archivator" "$APP/Contents/MacOS/Archivator"
cp Resources/Info.plist "$APP/Contents/Info.plist"
cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
cp bin/7zz "$APP/Contents/Resources/bin/7zz"
# Если положить утилиту rar от RARLAB в ./bin/rar — она тоже попадёт в приложение
if [ -x bin/rar ]; then cp bin/rar "$APP/Contents/Resources/bin/rar"; fi

echo "▸ Подпись (ad-hoc)…"
for tool in "$APP"/Contents/Resources/bin/*; do codesign --force --sign - "$tool"; done
codesign --force --sign - "$APP"

if [ "${1:-}" = "--dmg" ]; then
  echo "▸ DMG…"
  STAGE="build/dmg"
  rm -rf "$STAGE" build/Archivator.dmg
  mkdir -p "$STAGE"
  cp -R "$APP" "$STAGE/"
  ln -s /Applications "$STAGE/Applications"
  hdiutil create -volname Archivator -srcfolder "$STAGE" -ov -format UDZO build/Archivator.dmg >/dev/null
  rm -rf "$STAGE"
  echo "Готово: build/Archivator.dmg"
fi

du -sh "$APP"
echo "Готово: $APP   (запуск: open $APP)"

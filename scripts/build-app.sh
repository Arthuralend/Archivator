#!/bin/bash
# Сборка «ZIP Studio.app» для Apple Silicon. Использование:
#   ./scripts/build-app.sh          — собрать build/ZIP Studio.app
#   ./scripts/build-app.sh --dmg    — ещё и build/ZIPStudio.dmg
set -euo pipefail
cd "$(dirname "$0")/.."

APP="build/ZIP Studio.app"
EXE="ZIPStudio"

echo "▸ Компиляция (release, arm64)…"
swift build -c release --arch arm64
BIN_DIR="$(swift build -c release --arch arm64 --show-bin-path)"

echo "▸ 7-Zip…"
./scripts/fetch-7zz.sh

echo "▸ Сборка бандла…"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/bin"
cp "$BIN_DIR/$EXE" "$APP/Contents/MacOS/$EXE"
cp Resources/Info.plist "$APP/Contents/Info.plist"
cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
cp -R Resources/Toolbar "$APP/Contents/Resources/Toolbar"
cp bin/7zz "$APP/Contents/Resources/bin/7zz"
# Если положить утилиту rar от RARLAB в ./bin/rar — она тоже попадёт в приложение
if [ -x bin/rar ]; then cp bin/rar "$APP/Contents/Resources/bin/rar"; fi

# Фирменный цвет выделения (терракотовый Claude). Нужен actool из полного Xcode; без него — системный цвет.
if xcrun --find actool >/dev/null 2>&1; then
  echo "▸ Цвета (Assets.car)…"
  xcrun actool Resources/Assets.xcassets --compile "$APP/Contents/Resources" \
    --platform macosx --minimum-deployment-target 13.0 \
    --output-partial-info-plist build/assets-info.plist >/dev/null
else
  echo "▸ actool не найден (нужен Xcode) — будет системный цвет выделения"
fi

echo "▸ Подпись (ad-hoc)…"
for tool in "$APP"/Contents/Resources/bin/*; do codesign --force --sign - "$tool"; done
codesign --force --sign - "$APP"

if [ "${1:-}" = "--dmg" ]; then
  echo "▸ DMG…"
  STAGE="build/dmg"
  rm -rf "$STAGE" build/ZIPStudio.dmg
  mkdir -p "$STAGE"
  cp -R "$APP" "$STAGE/"
  ln -s /Applications "$STAGE/Applications"
  hdiutil create -volname "ZIP Studio" -srcfolder "$STAGE" -ov -format UDZO build/ZIPStudio.dmg >/dev/null
  rm -rf "$STAGE"
  echo "Готово: build/ZIPStudio.dmg"
fi

du -sh "$APP"
echo "Готово: $APP   (запуск: open \"$APP\")"

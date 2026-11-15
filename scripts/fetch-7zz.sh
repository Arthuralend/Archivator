#!/bin/bash
# Скачивает официальный консольный 7-Zip для macOS (универсальный: arm64 + x86_64) в ./bin/7zz
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${SEVENZIP_VERSION:-2409}"   # 7-Zip 24.09
URL="https://www.7-zip.org/a/7z${VERSION}-mac.tar.xz"

if [ -x bin/7zz ] && [ "${1:-}" != "--force" ]; then
  echo "bin/7zz уже есть (--force для повторной загрузки)"; exit 0
fi
mkdir -p bin
echo "Загрузка $URL"
curl -fL --retry 3 "$URL" -o bin/7z.tar.xz
tar -xJf bin/7z.tar.xz -C bin 7zz
rm -f bin/7z.tar.xz
chmod +x bin/7zz
echo "Готово: bin/7zz"

#!/bin/bash
# Достаёт официальный консольный 7-Zip для macOS (универсальный: arm64 + x86_64) в ./bin/7zz.
# Порядок: релизы 7-Zip на GitHub → 7-zip.org → Homebrew (brew install sevenzip).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -x bin/7zz ] && [ "${1:-}" != "--force" ]; then
  echo "bin/7zz уже есть (--force для повторной загрузки)"; exit 0
fi
mkdir -p bin

try_download() {  # $1 = версия вида 25.01
  local v="$1" short="${1//./}"
  for url in \
    "https://github.com/ip7z/7zip/releases/download/${v}/7z${short}-mac.tar.xz" \
    "https://www.7-zip.org/a/7z${short}-mac.tar.xz"; do
    echo "Загрузка $url"
    if curl -fsSL --retry 2 "$url" -o bin/7z.tar.xz && tar -xJf bin/7z.tar.xz -C bin 7zz; then
      rm -f bin/7z.tar.xz; return 0
    fi
  done
  rm -f bin/7z.tar.xz; return 1
}

for v in ${SEVENZIP_VERSION:-26.00 25.01 24.09}; do
  if try_download "$v"; then chmod +x bin/7zz; echo "Готово: bin/7zz (7-Zip $v)"; exit 0; fi
done

if command -v brew >/dev/null; then
  echo "Скачать не удалось — беру 7-Zip из Homebrew"
  brew list sevenzip >/dev/null 2>&1 || brew install sevenzip
  cp "$(brew --prefix)/bin/7zz" bin/7zz
  chmod +x bin/7zz
  echo "Готово: bin/7zz (Homebrew)"
  exit 0
fi

echo "Не удалось получить 7zz. Установите: brew install sevenzip" >&2
exit 1

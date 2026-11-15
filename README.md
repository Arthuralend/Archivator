# Archivator

Нативный архиватор для macOS (Apple Silicon M1/M2/M3/M4) на **Swift + SwiftUI** в классическом стиле:
панель с крупными кнопками, адресная строка, таблица файлов, строка состояния.
Архивы обрабатывает официальный консольный **7-Zip (`7zz`)**, он кладётся внутрь приложения.

| Формат | Открыть / распаковать | Создать / добавить / удалить |
|---|---|---|
| ZIP | ✅ | ✅ (пароль AES-256) |
| 7Z  | ✅ | ✅ (пароль, шифрование имён, solid) |
| RAR / RAR5 | ✅ | ⚠️ только с утилитой `rar` от RARLAB (см. ниже) — формат закрытый |
| TAR, GZ, BZ2, XZ, ISO, CAB | ✅ | — |

Размер приложения: ~3 МБ (код) + ~5 МБ (7zz) + иконка.

## Возможности
- Папки на диске и содержимое архивов в одной таблице; двойной клик / Enter — открыть, `..` или ⌘↑ — вверх
- Добавить, Извлечь, Тест, Просмотр (открывает файл из архива без полной распаковки), Удалить, Найти, Мастер, Инфо
- Пароли: запрос при открытии/распаковке зашифрованных архивов
- Уровни сжатия, разбиение на тома, solid-архивы, удаление файлов после упаковки
- Drag & drop: файлы в окно — создать архив (или добавить в открытый), архив в окно — открыть
- Открытие .zip/.rar/.7z из Finder («Открыть с помощью → Archivator»)
- Системные иконки файлов, контекстное меню, сортировка по колонкам, прогресс с отменой

## Создание RAR (необязательно)
Homebrew с 01.09.2026 больше не устанавливает `rar` (не проходит проверку Gatekeeper), поэтому вручную:
1. Скачайте «RAR for macOS ARM» с https://www.rarlab.com/download.htm
2. В Терминале:
   ```bash
   cd ~/Downloads && tar -xf rarmacos-*.tar*   # Safari может сам снять .gz
   mkdir -p ~/bin && cp rar/rar ~/bin/ && xattr -c ~/bin/rar
   ```
3. Перезапустите Archivator. Он ищет `rar` в `~/bin`, `/opt/homebrew/bin`, `/usr/local/bin`.

RAR — платная программа (40 дней пробного периода).

## Требования
- macOS 13 Ventura или новее
- Xcode Command Line Tools: `xcode-select --install` (полный Xcode не обязателен)

## Сборка
```bash
./scripts/build-app.sh          # → build/Archivator.app
./scripts/build-app.sh --dmg    # → ещё и build/Archivator.dmg
open build/Archivator.app
```
Скрипт сам скачает 7zz с 7-zip.org в `./bin`.

Быстрый запуск без сборки .app (нужен 7-Zip: `brew install sevenzip` или `./scripts/fetch-7zz.sh`):
```bash
swift run
```

Можно открыть проект в Xcode: `open Package.swift`.

## Структура
- `Sources/Archivator/ArchivatorApp.swift` — точка входа, меню, открытие файлов из Finder
- `Sources/Archivator/AppModel.swift` — состояние и все команды
- `Sources/Archivator/ArchiveEngine.swift` — запуск `7zz`/`rar`, разбор вывода `7zz l -slt`, прогресс, отмена
- `Sources/Archivator/ContentView.swift` — окно: панель инструментов, адрес, таблица, статус
- `Sources/Archivator/Sheets.swift` — диалоги создания архива, извлечения, пароля, информации
- `Resources/` — иконка (`AppIcon.icns`), `Info.plist`

import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @ObservedObject var model: AppModel
    @State private var dragOver = false

    var body: some View {
        VStack(spacing: 0) {
            ToolbarStrip(model: model)
            Divider()
            AddressBar(model: model)
            if model.showFind { FindBar(model: model) }
            if !model.sevenZipAvailable {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.yellow)
                    Text("Не найден 7-Zip. Установите его командой «brew install sevenzip» или скачайте готовую сборку ZIP Studio.")
                    Spacer()
                }
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Color.yellow.opacity(0.18))
            }
            FileTable(model: model)
                .overlay {
                    if dragOver {
                        RoundedRectangle(cornerRadius: 6)
                            .strokeBorder(Theme.accent, style: StrokeStyle(lineWidth: 2, dash: [6]))
                            .padding(4)
                            .allowsHitTesting(false)
                    }
                }
                .alert(model.confirm?.title ?? "", isPresented: Binding(
                    get: { model.confirm != nil },
                    set: { if !$0 { model.confirm = nil } }
                ), presenting: model.confirm) { c in
                    Button("Да", role: .destructive) { c.action() }
                    Button("Нет", role: .cancel) {}
                } message: { c in
                    Text(c.text)
                }
            StatusBar(model: model)
        }
        .frame(minWidth: 760, minHeight: 420)
        .background(Theme.window)
        .tint(Theme.accent)
        .navigationTitle(model.archive.map { $0.url.lastPathComponent } ?? model.fsDir.lastPathComponent)
        .overlay {
            if let p = model.progress { ProgressPanel(state: p) }
        }
        .dropDestination(for: URL.self) { urls, _ in
            model.handleDrop(urls)
            return true
        } isTargeted: { dragOver = $0 }
        .sheet(item: $model.sheet, onDismiss: { model.passwordSheetDismissed() }) { sheet in
            switch sheet {
            case .add(let files):
                AddSheet(files: files, rarAvailable: model.rarAvailable,
                         onOK: { o in model.sheet = nil; model.doAdd(o) },
                         onCancel: { model.sheet = nil })
            case .extract(let req):
                ExtractSheet(request: req,
                             onOK: { o in model.sheet = nil; model.doExtract(req, o) },
                             onCancel: { model.sheet = nil })
            case .password(let name):
                PasswordSheet(archiveName: name,
                              onOK: { model.finishPassword($0) },
                              onCancel: { model.finishPassword(nil) })
            case .info:
                InfoSheet(model: model, onClose: { model.sheet = nil })
            }
        }
        .alert(model.alert?.title ?? "", isPresented: Binding(
            get: { model.alert != nil },
            set: { if !$0 { model.alert = nil } }
        ), presenting: model.alert) { a in
            if let url = a.reveal {
                Button("Открыть папку") { NSWorkspace.shared.open(url) }
            }
            Button("OK", role: .cancel) {}
        } message: { a in
            Text(a.text)
        }
    }
}

// MARK: - Панель инструментов

struct ToolbarStrip: View {
    @ObservedObject var model: AppModel

    var body: some View {
        HStack(spacing: 2) {
            ToolButton(title: "Добавить", help: "Добавить файлы в архив") {
                ToolIcon(name: "add", fallback: "plus.rectangle.on.folder.fill")
            } action: { model.cmdAdd() }
            ToolButton(title: "Извлечь…", help: "Извлечь в указанную папку") {
                ToolIcon(name: "extract", fallback: "folder.fill")
            } action: { model.cmdExtract() }
            ToolButton(title: "Тест", help: "Проверить архив") {
                ToolIcon(name: "test", fallback: "checkmark.seal.fill")
            } action: { model.cmdTest() }
            ToolButton(title: "Просмотр", help: "Открыть файл из архива") {
                ToolIcon(name: "view", fallback: "eye.fill")
            } action: { model.cmdView() }
            ToolButton(title: "Удалить", help: "Удалить выделенное", disabled: model.selectedRows.isEmpty) {
                ToolIcon(name: "delete", fallback: "trash.fill")
            } action: { model.cmdDelete() }

            Divider().frame(height: 48).padding(.horizontal, 6)

            ToolButton(title: "Найти", help: "Поиск файлов") {
                ToolIcon(name: "find", fallback: "binoculars.fill")
            } action: { model.showFind.toggle() }
            ToolButton(title: "Мастер", help: "Пошаговый мастер: упаковать или распаковать") {
                ToolIcon(name: "wizard", fallback: "wand.and.stars")
            } action: { model.cmdWizard() }
            ToolButton(title: "Инфо", help: "Информация об архиве") {
                ToolIcon(name: "info", fallback: "info.circle.fill")
            } action: { model.cmdInfo() }
            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(
            LinearGradient(colors: [Theme.toolbarTop, Theme.window], startPoint: .top, endPoint: .bottom)
        )
    }
}

struct ToolButton<Icon: View>: View {
    let title: String
    var help: String = ""
    var disabled = false
    @ViewBuilder let icon: () -> Icon
    let action: () -> Void
    @State private var hover = false

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                icon().frame(width: 38, height: 38)
                Text(title).font(.system(size: 11, weight: .medium))
            }
            .frame(minWidth: 66)
            .padding(.vertical, 5)
            .padding(.horizontal, 6)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(hover && !disabled ? Theme.accent.opacity(0.14) : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(hover && !disabled ? Theme.accent.opacity(0.5) : Color.clear)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.4 : 1)
        .onHover { hover = $0 }
        .help(help.isEmpty ? title : help)
    }
}

// MARK: - Адресная строка и поиск

struct AddressBar: View {
    @ObservedObject var model: AppModel

    var body: some View {
        HStack(spacing: 6) {
            Button { model.goUp() } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 20))
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, Theme.accent)
            }
            .buttonStyle(.plain)
            .help("На уровень вверх (⌘↑)")

            HStack(spacing: 5) {
                Image(nsImage: model.isArchiveMode ? NSApp.applicationIconImage : IconCache.folder)
                    .resizable()
                    .frame(width: 16, height: 16)
                if model.isArchiveMode {
                    Text(model.addressPath)
                        .lineLimit(1)
                        .truncationMode(.head)
                        .textSelection(.enabled)
                    Spacer(minLength: 0)
                } else {
                    TextField("", text: $model.addressText)
                        .textFieldStyle(.plain)
                        .onSubmit { model.submitAddress() }
                }
            }
            .padding(.horizontal, 6)
            .frame(height: 24)
            .background(Theme.surface)
            .overlay(RoundedRectangle(cornerRadius: 5).stroke(Theme.border))
            .clipShape(RoundedRectangle(cornerRadius: 4))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
    }
}

struct FindBar: View {
    @ObservedObject var model: AppModel
    @FocusState private var focused: Bool

    var body: some View {
        HStack {
            Image(systemName: "magnifyingglass")
            TextField(model.isArchiveMode ? "Поиск по всему архиву…" : "Фильтр по имени…", text: $model.filter)
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 360)
                .focused($focused)
            Button("Закрыть") {
                model.filter = ""
                model.showFind = false
            }
            Spacer()
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .onAppear { focused = true }
    }
}

// MARK: - Таблица файлов

struct FileTable: View {
    @ObservedObject var model: AppModel

    var body: some View {
        let archiveMode = model.isArchiveMode
        Table(model.rows, selection: $model.selection, sortOrder: $model.sortOrder) {
            TableColumn("Имя", value: \Row.name) { (r: Row) in
                NameCell(row: r, archiveMode: archiveMode)
            }
            .width(min: 180, ideal: 300)

            TableColumn("Размер", value: \Row.size) { (r: Row) in
                Text(r.isUp || (r.isDir && !archiveMode) ? "" : Fmt.size(r.size))
                    .monospacedDigit()
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 70, ideal: 100)

            TableColumn("Сжат", value: \Row.packed) { (r: Row) in
                Text(archiveMode && !r.isUp ? Fmt.size(r.packed) : "")
                    .monospacedDigit()
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .width(min: 60, ideal: 100)

            TableColumn("Тип", value: \Row.typeName) { (r: Row) in
                Text(r.typeName).lineLimit(1)
            }
            .width(min: 80, ideal: 140)

            TableColumn("Изменён", value: \Row.modified) { (r: Row) in
                Text(Fmt.date(r.modified)).monospacedDigit()
            }
            .width(min: 100, ideal: 130)

            TableColumn("CRC32", value: \Row.crc) { (r: Row) in
                Text(r.crc).font(.system(size: 11, design: .monospaced))
            }
            .width(min: 60, ideal: 80)
        }
        .scrollContentBackground(.hidden)
        .background(Theme.surface)
        .contextMenu(forSelectionType: Row.ID.self) { ids in
            if !ids.isEmpty {
                Button("Открыть") {
                    if let id = ids.first { model.activate(id) }
                }
                Button("Извлечь…") {
                    model.selection = ids
                    model.cmdExtract()
                }
                if !archiveMode {
                    Button("Добавить в архив…") {
                        model.selection = ids
                        model.cmdAdd()
                    }
                    Button("Показать в Finder") {
                        let urls = ids.filter { $0 != ".." }.map { URL(fileURLWithPath: $0) }
                        NSWorkspace.shared.activateFileViewerSelecting(urls)
                    }
                }
                Divider()
                Button("Удалить…") {
                    model.selection = ids
                    model.cmdDelete()
                }
            }
        } primaryAction: { ids in
            if let id = ids.first { model.activate(id) }
        }
    }
}

struct NameCell: View {
    let row: Row
    let archiveMode: Bool

    var body: some View {
        HStack(spacing: 6) {
            if row.isUp {
                Image(systemName: "arrow.turn.left.up")
                    .foregroundStyle(Theme.accent)
                    .frame(width: 16, height: 16)
            } else {
                Image(nsImage: IconCache.icon(for: row, archiveMode: archiveMode))
                    .resizable()
                    .frame(width: 16, height: 16)
            }
            Text(row.name + (row.encrypted ? " *" : ""))
                .lineLimit(1)
                .truncationMode(.middle)
        }
    }
}

/// Системные иконки Finder для файлов и папок
@MainActor
enum IconCache {
    private static var cache: [String: NSImage] = [:]

    static var folder: NSImage { cached("folder") { NSWorkspace.shared.icon(for: .folder) } }

    static func icon(for row: Row, archiveMode: Bool) -> NSImage {
        if row.isDir { return folder }
        if !archiveMode {
            return cached("path:" + row.target) { NSWorkspace.shared.icon(forFile: row.target) }
        }
        let ext = row.ext
        return cached("ext:" + ext) {
            NSWorkspace.shared.icon(for: UTType(filenameExtension: ext) ?? .data)
        }
    }

    private static func cached(_ key: String, _ make: () -> NSImage) -> NSImage {
        if let img = cache[key] { return img }
        let img = make()
        if cache.count > 2000 { cache.removeAll() }
        cache[key] = img
        return img
    }
}

// MARK: - Строка состояния

struct StatusBar: View {
    @ObservedObject var model: AppModel

    var body: some View {
        let rows = model.rows.filter { !$0.isUp }
        let sel = rows.filter { model.selection.contains($0.id) }
        HStack(spacing: 4) {
            StatusPanel {
                HStack(spacing: 4) {
                    Image(nsImage: model.isArchiveMode ? NSApp.applicationIconImage : IconCache.folder)
                        .resizable().frame(width: 14, height: 14)
                    Text(kindText)
                }
            }
            StatusPanel {
                if sel.isEmpty {
                    let files = rows.filter { !$0.isDir }
                    let dirs = rows.count - files.count
                    Text("Всего \(dirs > 0 ? "\(dirs) папок и " : "")\(Fmt.size(rows.reduce(0) { $0 + $1.size })) байт в \(files.count) файлах")
                } else {
                    Text("Выделено \(Fmt.size(sel.reduce(0) { $0 + $1.size })) байт в \(sel.count) объектах")
                }
                Spacer(minLength: 0)
            }
        }
        .font(.system(size: 11))
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
    }

    private var kindText: String {
        guard let a = model.archive else { return "Папка" }
        var parts = [a.listing.type.isEmpty ? "Архив" : a.listing.type]
        if model.archiveStats?.encrypted == true { parts.append("зашифрован") }
        if a.listing.solid { parts.append("непрерывный") }
        return parts.joined(separator: ", ")
    }
}

struct StatusPanel<Content: View>: View {
    @ViewBuilder let content: () -> Content
    var body: some View {
        HStack(spacing: 4) { content() }
            .padding(.horizontal, 6)
            .frame(height: 20)
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(Theme.border))
    }
}

// MARK: - Прогресс

struct ProgressPanel: View {
    let state: ProgressState

    var body: some View {
        ZStack {
            Color.black.opacity(0.15).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 10) {
                Text(state.title).font(.headline)
                Text(state.subtitle).lineLimit(1).truncationMode(.middle).foregroundStyle(.secondary)
                if let p = state.percent {
                    ProgressView(value: Double(p), total: 100)
                } else {
                    ProgressView().progressViewStyle(.linear)
                }
                HStack {
                    Text(state.percent.map { "\($0)%" } ?? "Подождите…").foregroundStyle(.secondary)
                    Spacer()
                    Button("Отмена") { state.handle.cancel() }
                        .keyboardShortcut(.cancelAction)
                }
            }
            .padding(18)
            .frame(width: 400)
            .background(RoundedRectangle(cornerRadius: 10).fill(.regularMaterial))
            .shadow(radius: 20)
        }
    }
}

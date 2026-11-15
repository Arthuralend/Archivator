import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct ExtractRequest {
    var archives: [URL]
    var files: [String]
    var defaultDest: URL
    var summary: String
}

enum SheetKind: Identifiable {
    case add([URL])
    case extract(ExtractRequest)
    case password(String)
    case info

    var id: String {
        switch self {
        case .add: return "add"
        case .extract: return "extract"
        case .password: return "password"
        case .info: return "info"
        }
    }
}

struct ProgressState {
    var title: String
    var subtitle: String
    var percent: Int?
    var handle: OperationHandle
}

struct AlertInfo: Identifiable {
    enum Kind { case info, error, success }
    let id = UUID()
    var title: String
    var text: String
    var kind: Kind = .info
    var reveal: URL? = nil
}

struct ConfirmInfo: Identifiable {
    let id = UUID()
    var title: String
    var text: String
    var action: () -> Void
}

@MainActor
final class AppModel: ObservableObject {
    static let shared = AppModel()

    // Состояние
    @Published var fsDir: URL = FileManager.default.homeDirectoryForCurrentUser
    @Published var fsRows: [Row] = []
    @Published var archive: OpenArchive?
    @Published var arcDir: String = ""
    @Published var selection = Set<Row.ID>()
    @Published var sortOrder: [KeyPathComparator<Row>] = [KeyPathComparator(\Row.name)]
    @Published var filter = ""
    @Published var showFind = false
    @Published var addressText = ""

    // Окна
    @Published var sheet: SheetKind?
    @Published var progress: ProgressState?
    @Published var alert: AlertInfo?
    @Published var confirm: ConfirmInfo?

    private var passwordContinuation: CheckedContinuation<String?, Never>?

    let sevenZipAvailable = ArchiveEngine.sevenZip != nil
    let rarAvailable = ArchiveEngine.rar != nil

    private init() {
        loadDir(fsDir)
    }

    var isArchiveMode: Bool { archive != nil }

    // MARK: - Строки таблицы

    var rows: [Row] {
        var base: [Row]
        if let archive {
            if filter.isEmpty {
                base = Self.archiveRows(archive.listing.entries, dir: arcDir)
            } else {
                let f = filter.lowercased()
                base = archive.listing.entries
                    .filter { !$0.isDir && $0.path.lowercased().contains(f) }
                    .map { e in
                        var r = Row(id: e.path, name: e.path, isDir: false, size: e.size, packed: e.packed,
                                    modified: e.modified ?? .distantPast, crc: e.crc, encrypted: e.encrypted, target: e.path)
                        r.typeName = Self.typeName(for: r, archiveMode: true)
                        return r
                    }
            }
        } else {
            base = filter.isEmpty ? fsRows : fsRows.filter { $0.name.lowercased().contains(filter.lowercased()) }
        }

        let sorted = base.sorted(using: sortOrder)
        let dirs = sorted.filter { $0.isDir }
        let files = sorted.filter { !$0.isDir }
        var result = dirs + files
        let canGoUp = archive != nil || fsDir.path != "/"
        if canGoUp && filter.isEmpty {
            result.insert(Row(id: "..", name: "..", isDir: true, isUp: true, typeName: "Папка", target: ".."), at: 0)
        }
        return result
    }

    var selectedRows: [Row] {
        rows.filter { selection.contains($0.id) && !$0.isUp }
    }

    static func typeName(for r: Row, archiveMode: Bool) -> String {
        if r.isUp { return "Папка" }
        if r.isDir { return "Папка с файлами" }
        let e = r.ext.uppercased()
        if !archiveMode && r.isArchive { return "Архив \(e)" }
        return e.isEmpty ? "Файл" : "Файл «\(e)»"
    }

    /// Строки текущей папки внутри архива; промежуточные папки достраиваются из путей файлов.
    static func archiveRows(_ entries: [ArchiveEntry], dir: String) -> [Row] {
        let prefix = dir.isEmpty ? "" : dir + "/"
        var map: [String: Row] = [:]
        var order: [String] = []
        for e in entries {
            guard prefix.isEmpty || e.path.hasPrefix(prefix) else { continue }
            let rest = String(e.path.dropFirst(prefix.count))
            if rest.isEmpty { continue }
            let slash = rest.firstIndex(of: "/")
            let name = slash.map { String(rest[..<$0]) } ?? rest
            let full = prefix + name
            let nested = slash != nil
            var row: Row
            if let existing = map[name] {
                row = existing
            } else {
                order.append(name)
                row = Row(id: full, name: name, isDir: false, target: full)
            }
            if nested || e.isDir { row.isDir = true }
            if !e.isDir {
                row.size += e.size
                row.packed += e.packed
            }
            if !nested {
                row.modified = e.modified ?? .distantPast
                row.crc = e.crc
                row.encrypted = e.encrypted
            } else if let m = e.modified, m > row.modified {
                row.modified = m
            }
            map[name] = row
        }
        return order.compactMap { name in
            guard var r = map[name] else { return nil }
            if r.isDir { r.crc = "" }
            r.typeName = typeName(for: r, archiveMode: true)
            return r
        }
    }

    var addressPath: String {
        if let archive { return archive.url.path + (arcDir.isEmpty ? "" : "/" + arcDir) }
        return fsDir.path
    }

    var archiveStats: (files: Int, folders: Int, size: Int64, packed: Int64, encrypted: Bool)? {
        guard let archive else { return nil }
        let files = archive.listing.entries.filter { !$0.isDir }
        var dirs = Set<String>()
        for e in archive.listing.entries {
            let parts = e.path.split(separator: "/").map(String.init)
            let limit = e.isDir ? parts.count : parts.count - 1
            if limit >= 1 {
                for i in 1...limit { dirs.insert(parts[0..<i].joined(separator: "/")) }
            }
        }
        return (files.count, dirs.count,
                files.reduce(0) { $0 + $1.size }, files.reduce(0) { $0 + $1.packed },
                archive.listing.entries.contains { $0.encrypted })
    }

    // MARK: - Навигация

    func loadDir(_ dir: URL, select: String? = nil) {
        let keys: [URLResourceKey] = [.isDirectoryKey, .isPackageKey, .fileSizeKey, .contentModificationDateKey]
        do {
            let items = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: keys,
                                                                   options: [.skipsHiddenFiles])
            fsRows = items.map { url in
                let v = try? url.resourceValues(forKeys: Set(keys))
                let isDir = (v?.isDirectory ?? false) && !(v?.isPackage ?? false)
                var r = Row(id: url.path, name: url.lastPathComponent, isDir: isDir,
                            isArchive: !isDir && isArchive(url),
                            size: isDir ? 0 : Int64(v?.fileSize ?? 0),
                            modified: v?.contentModificationDate ?? .distantPast,
                            target: url.path)
                r.typeName = Self.typeName(for: r, archiveMode: false)
                return r
            }
            fsDir = dir
            archive = nil
            arcDir = ""
            filter = ""
            addressText = dir.path
            selection = select.map { [$0] } ?? []
        } catch {
            showError("Не удалось открыть папку\n\(dir.path)\n\(error.localizedDescription)")
        }
    }

    func goUp() {
        filter = ""
        if let archive {
            if !arcDir.isEmpty {
                let prev = arcDir
                if let i = arcDir.lastIndex(of: "/") { arcDir = String(arcDir[..<i]) } else { arcDir = "" }
                selection = [prev]
            } else {
                loadDir(archive.url.deletingLastPathComponent(), select: archive.url.path)
            }
        } else if fsDir.path != "/" {
            loadDir(fsDir.deletingLastPathComponent(), select: fsDir.path)
        }
    }

    func activate(_ id: Row.ID) {
        guard let row = rows.first(where: { $0.id == id }) else { return }
        if row.isUp { return goUp() }
        if archive != nil {
            if row.isDir {
                filter = ""
                arcDir = row.target
                selection = []
            } else {
                Task { await view(row) }
            }
        } else if row.isDir {
            loadDir(URL(fileURLWithPath: row.target))
        } else if row.isArchive {
            Task { await openArchive(URL(fileURLWithPath: row.target)) }
        } else {
            NSWorkspace.shared.open(URL(fileURLWithPath: row.target))
        }
    }

    func openAny(_ url: URL) {
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir) else {
            return showError("Путь не найден:\n\(url.path)")
        }
        if isDir.boolValue { loadDir(url) } else { Task { await openArchive(url) } }
    }

    func submitAddress() {
        guard archive == nil else { return }
        openAny(URL(fileURLWithPath: (addressText as NSString).expandingTildeInPath))
    }

    // MARK: - Пароль

    func askPassword(for archive: URL) async -> String? {
        await withCheckedContinuation { cont in
            passwordContinuation = cont
            sheet = .password(archive.lastPathComponent)
        }
    }

    func finishPassword(_ value: String?) {
        let c = passwordContinuation
        passwordContinuation = nil
        if case .password = sheet { sheet = nil }
        c?.resume(returning: value)
    }

    /// Окно пароля закрыто (Esc или программно) — если ответа не было, считаем это отменой
    func passwordSheetDismissed() {
        // Если уже открыт новый запрос пароля (повтор после неверного), его не трогаем
        if case .password = sheet { return }
        guard let c = passwordContinuation else { return }
        passwordContinuation = nil
        c.resume(returning: nil)
    }

    /// Выполняет операцию, запрашивая пароль, пока он неверный. Возвращает итоговый пароль.
    @discardableResult
    func withPassword(_ archive: URL, initial: String?, _ op: (String?) async throws -> Void) async throws -> String? {
        var pw = initial
        while true {
            do {
                try await op(pw)
                return pw
            } catch let e as ArchiveError where e.needPassword {
                guard let next = await askPassword(for: archive) else {
                    throw ArchiveError(message: "", cancelled: true)
                }
                pw = next
            }
        }
    }

    // MARK: - Прогресс и сообщения

    @discardableResult
    func runOp<T>(_ title: String, _ subtitle: String, _ body: (OperationHandle, @escaping ProgressCallback) async throws -> T) async throws -> T {
        let handle = OperationHandle()
        progress = ProgressState(title: title, subtitle: subtitle, percent: nil, handle: handle)
        defer { progress = nil }
        let onProgress: ProgressCallback = { [weak self] p in
            Task { @MainActor in self?.progress?.percent = p }
        }
        return try await body(handle, onProgress)
    }

    func showError(_ text: String) {
        alert = AlertInfo(title: "Ошибка", text: text, kind: .error)
    }

    func report(_ error: Error) {
        if let e = error as? ArchiveError, e.cancelled { return }
        showError(error.localizedDescription)
    }

    // MARK: - Открытие архива

    func openArchive(_ url: URL) async {
        do {
            var listing: ArchiveListing?
            let pw = try await withPassword(url, initial: nil) { pw in
                listing = try await ArchiveEngine.list(url, password: pw)
            }
            guard let listing else { return }
            fsDir = url.deletingLastPathComponent()
            archive = OpenArchive(url: url, listing: listing, password: pw)
            arcDir = ""
            filter = ""
            selection = []
            NSDocumentController.shared.noteNewRecentDocumentURL(url)
        } catch {
            report(error)
        }
    }

    func reloadArchive() async {
        guard let a = archive else { return }
        if let listing = try? await ArchiveEngine.list(a.url, password: a.password) {
            archive?.listing = listing
        }
    }

    // MARK: - Команды

    func cmdOpen() {
        let panel = NSOpenPanel()
        panel.title = "Открыть архив"
        panel.allowedContentTypes = archiveExtensions.compactMap { UTType(filenameExtension: $0) }
        panel.allowsOtherFileTypes = true
        guard panel.runModal() == .OK, let url = panel.url else { return }
        Task { await openArchive(url) }
    }

    func cmdChangeDir() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.directoryURL = fsDir
        guard panel.runModal() == .OK, let url = panel.url else { return }
        loadDir(url)
    }

    func pickFiles() -> [URL] {
        let panel = NSOpenPanel()
        panel.title = "Выберите файлы"
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = true
        panel.directoryURL = fsDir
        return panel.runModal() == .OK ? panel.urls : []
    }

    func cmdAdd(files override: [URL]? = nil) {
        if let archive {
            let files = override ?? pickFiles()
            guard !files.isEmpty else { return }
            guard let fmt = ArchiveFormat.from(url: archive.url) else {
                return showError("Добавлять файлы можно только в ZIP, 7Z и RAR архивы.")
            }
            Task {
                do {
                    try await runOp("Добавление в архив", archive.url.lastPathComponent) { h, p in
                        try await ArchiveEngine.add(AddOptions(archive: archive.url, files: files, format: fmt,
                                                               password: archive.password), handle: h, onProgress: p)
                    }
                    await reloadArchive()
                } catch { report(error) }
            }
            return
        }
        let files = override ?? selectedRows.map { URL(fileURLWithPath: $0.target) }
        guard !files.isEmpty else {
            alert = AlertInfo(title: "Добавление", text: "Выделите файлы и папки, которые нужно добавить в архив.")
            return
        }
        sheet = .add(files)
    }

    func doAdd(_ o: AddOptions) {
        Task {
            do {
                try await runOp("Создание архива", o.archive.lastPathComponent) { h, p in
                    try await ArchiveEngine.add(o, handle: h, onProgress: p)
                }
                loadDir(fsDir, select: o.archive.path)
            } catch { report(error) }
        }
    }

    func cmdExtract() {
        if let archive {
            let files = selectedRows.map(\.target)
            sheet = .extract(ExtractRequest(
                archives: [archive.url], files: files,
                defaultDest: archive.url.deletingLastPathComponent().appendingPathComponent(stripExt(archive.url.lastPathComponent)),
                summary: files.isEmpty ? "весь архив" : "выделено объектов: \(files.count)"))
            return
        }
        let archives = selectedRows.filter(\.isArchive).map { URL(fileURLWithPath: $0.target) }
        guard !archives.isEmpty else {
            alert = AlertInfo(title: "Извлечение", text: "Выделите один или несколько архивов.")
            return
        }
        sheet = .extract(ExtractRequest(
            archives: archives, files: [],
            defaultDest: archives.count == 1 ? fsDir.appendingPathComponent(stripExt(archives[0].lastPathComponent)) : fsDir,
            summary: archives.count == 1 ? archives[0].lastPathComponent : "архивов: \(archives.count)"))
    }

    func doExtract(_ req: ExtractRequest, _ o: ExtractOptions) {
        Task {
            for a in req.archives {
                let dest = req.archives.count > 1 ? o.dest.appendingPathComponent(stripExt(a.lastPathComponent)) : o.dest
                let initial = o.password ?? (archive?.url == a ? archive?.password : nil)
                do {
                    try await runOp("Извлечение", a.lastPathComponent) { h, p in
                        try await self.withPassword(a, initial: initial) { pw in
                            try await ArchiveEngine.extract(a, to: dest, files: req.files, password: pw,
                                                            overwrite: o.overwrite, handle: h, onProgress: p)
                        }
                    }
                } catch {
                    if let e = error as? ArchiveError, e.cancelled { return }
                    return showError("\(a.lastPathComponent)\n\n\(error.localizedDescription)")
                }
            }
            alert = AlertInfo(title: "Готово", text: "Файлы извлечены в\n\(o.dest.path)", kind: .success, reveal: o.dest)
            if archive == nil { loadDir(fsDir, select: req.archives.first?.path) }
        }
    }

    func cmdTest() {
        let targets = archive.map { [$0.url] } ?? selectedRows.filter(\.isArchive).map { URL(fileURLWithPath: $0.target) }
        guard !targets.isEmpty else {
            alert = AlertInfo(title: "Проверка", text: "Выделите архив для проверки.")
            return
        }
        Task {
            var lines: [String] = []
            var allOk = true
            for a in targets {
                let initial = archive?.url == a ? archive?.password : nil
                do {
                    try await runOp("Проверка архива", a.lastPathComponent) { h, p in
                        try await self.withPassword(a, initial: initial) { pw in
                            try await ArchiveEngine.test(a, password: pw, handle: h, onProgress: p)
                        }
                    }
                    lines.append("✓ \(a.lastPathComponent) — ошибок не обнаружено")
                } catch {
                    if let e = error as? ArchiveError, e.cancelled { return }
                    allOk = false
                    lines.append("✕ \(a.lastPathComponent)\n    \(error.localizedDescription)")
                }
            }
            alert = AlertInfo(title: "Результаты проверки", text: lines.joined(separator: "\n"), kind: allOk ? .success : .error)
        }
    }

    func cmdView() {
        guard let row = selectedRows.first(where: { !$0.isDir }) else { return }
        Task { await view(row) }
    }

    func view(_ row: Row) async {
        guard let a = archive else {
            if row.isArchive { await openArchive(URL(fileURLWithPath: row.target)) }
            else { NSWorkspace.shared.open(URL(fileURLWithPath: row.target)) }
            return
        }
        do {
            let tmp = FileManager.default.temporaryDirectory
                .appendingPathComponent("Archivator-\(UUID().uuidString.prefix(8))")
            let pw = try await runOp("Просмотр", row.name) { h, p in
                try await self.withPassword(a.url, initial: a.password) { pw in
                    try await ArchiveEngine.extract(a.url, to: tmp, files: [row.target], password: pw,
                                                    flat: true, handle: h, onProgress: p)
                }
            }
            if let pw, pw != a.password { archive?.password = pw }
            NSWorkspace.shared.open(tmp.appendingPathComponent((row.target as NSString).lastPathComponent))
        } catch { report(error) }
    }

    func cmdDelete() {
        let rows = selectedRows
        guard !rows.isEmpty else { return }
        let what = rows.count == 1 ? "«\(rows[0].name)»" : "\(rows.count) объект(а/ов)"
        if let a = archive {
            confirm = ConfirmInfo(title: "Удаление", text: "Удалить \(what) из архива?\nЭто действие нельзя отменить.") { [weak self] in
                guard let self else { return }
                Task {
                    do {
                        try await ArchiveEngine.delete(from: a.url, files: rows.map(\.target), type: a.listing.type, password: a.password)
                        self.selection = []
                        await self.reloadArchive()
                    } catch { self.report(error) }
                }
            }
        } else {
            confirm = ConfirmInfo(title: "Удаление", text: "Переместить \(what) в Корзину?") { [weak self] in
                guard let self else { return }
                for r in rows {
                    do { try FileManager.default.trashItem(at: URL(fileURLWithPath: r.target), resultingItemURL: nil) }
                    catch { self.showError(error.localizedDescription); break }
                }
                self.loadDir(self.fsDir)
            }
        }
    }

    func cmdInfo() {
        if archive != nil { sheet = .info; return }
        if let r = selectedRows.first, r.isArchive {
            Task {
                await openArchive(URL(fileURLWithPath: r.target))
                if archive != nil { sheet = .info }
            }
            return
        }
        let total = selectedRows.reduce(Int64(0)) { $0 + $1.size }
        alert = AlertInfo(title: "Информация",
                          text: "Папка: \(fsDir.path)\nВыделено: \(selectedRows.count)\nОбъём файлов: \(Fmt.short(total))")
    }

    /// «Мастер»: выбрал архив — распаковать, выбрал файлы — упаковать
    func cmdWizard() {
        let files = pickFiles()
        guard !files.isEmpty else { return }
        if files.count == 1, isArchive(files[0]) {
            let a = files[0]
            sheet = .extract(ExtractRequest(archives: [a], files: [],
                                            defaultDest: a.deletingLastPathComponent().appendingPathComponent(stripExt(a.lastPathComponent)),
                                            summary: a.lastPathComponent))
        } else {
            archive = nil
            sheet = .add(files)
        }
    }

    func selectAll() {
        selection = Set(rows.filter { !$0.isUp }.map(\.id))
    }

    func handleDrop(_ urls: [URL]) {
        guard !urls.isEmpty else { return }
        if let a = archive {
            confirm = ConfirmInfo(title: "Добавление",
                                  text: "Добавить \(urls.count) объект(а/ов) в архив \(a.url.lastPathComponent)?") { [weak self] in
                self?.cmdAdd(files: urls)
            }
        } else if urls.count == 1, isArchive(urls[0]) {
            Task { await openArchive(urls[0]) }
        } else {
            sheet = .add(urls)
        }
    }
}

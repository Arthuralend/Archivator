import Foundation

/// Ошибка операции с архивом
struct ArchiveError: LocalizedError {
    var message: String
    var needPassword = false
    var cancelled = false
    var errorDescription: String? { message }
}

/// Запущенный процесс, который можно отменить из интерфейса
final class OperationHandle: @unchecked Sendable {
    private let lock = NSLock()
    private var process: Process?
    private(set) var isCancelled = false

    func attach(_ p: Process) {
        lock.lock(); defer { lock.unlock() }
        process = p
        if isCancelled, p.isRunning { p.terminate() }
    }

    func cancel() {
        lock.lock(); defer { lock.unlock() }
        isCancelled = true
        if let p = process, p.isRunning { p.terminate() }
    }
}

/// Потокобезопасный буфер вывода процесса
final class OutputBuffer: @unchecked Sendable {
    private let lock = NSLock()
    private var out = Data()
    private var err = Data()

    func appendOut(_ d: Data) { lock.lock(); out.append(d); lock.unlock() }
    func appendErr(_ d: Data) { lock.lock(); err.append(d); lock.unlock() }
    func result(code: Int32) -> ProcessResult {
        lock.lock(); defer { lock.unlock() }
        return ProcessResult(code: code,
                             stdout: String(decoding: out, as: UTF8.self),
                             stderr: String(decoding: err, as: UTF8.self))
    }
}

typealias ProgressCallback = @Sendable (Int) -> Void

struct ProcessResult {
    var code: Int32
    var stdout: String
    var stderr: String
    var combined: String { stderr + "\n" + stdout }
}

/// Обёртка над консольным 7-Zip (7zz) и утилитой rar.
/// 7zz: ZIP/7Z — чтение и запись, RAR — чтение. Создание RAR — только через `rar` от RARLAB.
enum ArchiveEngine {
    // MARK: Поиск утилит

    private static let searchDirs = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]

    static func findTool(_ names: [String]) -> URL? {
        let fm = FileManager.default
        var dirs: [URL] = []
        if let res = Bundle.main.resourceURL { dirs.append(res.appendingPathComponent("bin")) }
        // рядом с исполняемым файлом (режим `swift run`) и ./bin в папке проекта
        let exeDir = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
        dirs.append(exeDir)
        dirs.append(URL(fileURLWithPath: fm.currentDirectoryPath).appendingPathComponent("bin"))
        dirs += searchDirs.map { URL(fileURLWithPath: $0) }
        dirs += (ProcessInfo.processInfo.environment["PATH"] ?? "").split(separator: ":").map { URL(fileURLWithPath: String($0)) }
        for name in names {
            for d in dirs {
                let u = d.appendingPathComponent(name)
                if fm.isExecutableFile(atPath: u.path) { return u }
            }
        }
        return nil
    }

    static let sevenZip: URL? = findTool(["7zz", "7z"])
    static let rar: URL? = findTool(["rar"])

    private static func requireSevenZip() throws -> URL {
        guard let t = sevenZip else {
            throw ArchiveError(message: "Не найден 7-Zip (7zz).\nУстановите: brew install sevenzip\nили соберите приложение скриптом scripts/build-app.sh")
        }
        return t
    }

    // MARK: Запуск процесса

    static func run(_ exe: URL, _ args: [String], cwd: URL? = nil,
                    handle: OperationHandle? = nil,
                    onProgress: ProgressCallback? = nil) async throws -> ProcessResult {
        try await withCheckedThrowingContinuation { cont in
            let p = Process()
            p.executableURL = exe
            p.arguments = args
            if let cwd { p.currentDirectoryURL = cwd }
            p.standardInput = FileHandle.nullDevice
            let out = Pipe(), err = Pipe()
            p.standardOutput = out
            p.standardError = err

            let buf = OutputBuffer()

            out.fileHandleForReading.readabilityHandler = { h in
                let d = h.availableData
                guard !d.isEmpty else { return }
                buf.appendOut(d)
                if let onProgress, let pct = lastPercent(in: String(decoding: d, as: UTF8.self)) {
                    onProgress(pct)
                }
            }
            err.fileHandleForReading.readabilityHandler = { h in
                let d = h.availableData
                guard !d.isEmpty else { return }
                buf.appendErr(d)
            }

            p.terminationHandler = { proc in
                out.fileHandleForReading.readabilityHandler = nil
                err.fileHandleForReading.readabilityHandler = nil
                buf.appendOut(out.fileHandleForReading.readDataToEndOfFile())
                buf.appendErr(err.fileHandleForReading.readDataToEndOfFile())
                let result = buf.result(code: proc.terminationStatus)
                if handle?.isCancelled == true {
                    cont.resume(throwing: ArchiveError(message: "Операция отменена", cancelled: true))
                } else {
                    cont.resume(returning: result)
                }
            }

            do {
                try p.run()
                handle?.attach(p)
            } catch {
                out.fileHandleForReading.readabilityHandler = nil
                err.fileHandleForReading.readabilityHandler = nil
                cont.resume(throwing: ArchiveError(message: "Не удалось запустить \(exe.lastPathComponent): \(error.localizedDescription)"))
            }
        }
    }

    /// 7zz -bsp1 печатает «  42% 12 - file», rar — «  42%»
    static func lastPercent(in s: String) -> Int? {
        var result: Int?
        let chars = Array(s)
        for (i, c) in chars.enumerated() where c == "%" {
            var j = i - 1
            var digits = ""
            while j >= 0, chars[j].isNumber, digits.count < 3 {
                digits = String(chars[j]) + digits
                j -= 1
            }
            if let v = Int(digits), v <= 100 { result = v }
        }
        return result
    }

    private static func isPasswordError(_ text: String) -> Bool {
        let t = text.lowercased()
        return ["wrong password", "can not open encrypted archive", "enter password",
                "incorrect password", "data error in encrypted", "break signaled"].contains { t.contains($0) }
    }

    private static func failure(_ r: ProcessResult, _ fallback: String) -> ArchiveError {
        let lines = r.combined
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { l in
                let low = l.lowercased()
                return low.contains("error") || low.hasPrefix("can not") || low.hasPrefix("cannot")
                    || low.contains("wrong") || low.contains("unsupported") || low.contains("is not archive")
            }
        let msg = lines.prefix(4).joined(separator: "\n")
        return ArchiveError(message: msg.isEmpty ? fallback : msg, needPassword: isPasswordError(r.combined))
    }

    private static func pw(_ password: String?) -> [String] {
        // Без пароля ключ -p не передаём: stdin закрыт, запрос пароля сразу завершится ошибкой,
        // которую мы распознаём как needPassword.
        guard let password, !password.isEmpty else { return [] }
        return ["-p\(password)"]
    }

    // MARK: Листинг

    static func list(_ archive: URL, password: String?) async throws -> ArchiveListing {
        let bin = try requireSevenZip()
        let r = try await run(bin, ["l", "-slt", "-sccUTF-8"] + pw(password) + ["--", archive.path])
        let listing = parseSlt(r.stdout)
        if r.code != 0 && listing.entries.isEmpty {
            throw failure(r, "Не удалось открыть архив")
        }
        return listing
    }

    private static let sltDate: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f
    }()

    /// Разбор вывода `7zz l -slt`
    static func parseSlt(_ stdout: String) -> ArchiveListing {
        let lines = stdout.replacingOccurrences(of: "\r", with: "").components(separatedBy: "\n")
        var head: [String: String] = [:]
        var entries: [ArchiveEntry] = []
        var inBody = false
        var rec: [String: String] = [:]

        func kv(_ line: String) -> (String, String)? {
            guard let r = line.range(of: " =") else { return nil }
            let key = String(line[..<r.lowerBound]).trimmingCharacters(in: .whitespaces)
            var val = String(line[r.upperBound...])
            if val.hasPrefix(" ") { val.removeFirst() }
            return key.isEmpty ? nil : (key, val)
        }

        func flush() {
            defer { rec = [:] }
            guard var path = rec["Path"] else { return }
            path = path.replacingOccurrences(of: "\\", with: "/")
            while path.hasSuffix("/") { path.removeLast() }
            let attrs = rec["Attributes"] ?? ""
            let isDir = rec["Folder"] == "+" || attrs.hasPrefix("D") || attrs.contains(" D")
            var date: Date?
            if let m = rec["Modified"], m.count >= 19 {
                date = sltDate.date(from: String(m.prefix(19)).replacingOccurrences(of: "T", with: " "))
            }
            entries.append(ArchiveEntry(path: path, isDir: isDir,
                                        size: Int64(rec["Size"] ?? "") ?? 0,
                                        packed: Int64(rec["Packed Size"] ?? "") ?? 0,
                                        modified: date,
                                        crc: rec["CRC"] ?? "",
                                        encrypted: rec["Encrypted"] == "+",
                                        method: rec["Method"] ?? ""))
        }

        for line in lines {
            if !inBody {
                if line.hasPrefix("----------") { inBody = true; continue }
                if let pair = kv(line) { head[pair.0] = pair.1 }
                continue
            }
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                flush()
            } else if let pair = kv(line) {
                rec[pair.0] = pair.1
            }
        }
        flush()

        return ArchiveListing(type: head["Type"] ?? "",
                              physicalSize: Int64(head["Physical Size"] ?? "") ?? 0,
                              solid: head["Solid"] == "+",
                              entries: entries)
    }

    // MARK: Операции

    static func extract(_ archive: URL, to dest: URL, files: [String] = [], password: String?,
                        overwrite: OverwriteMode = .overwrite, flat: Bool = false,
                        handle: OperationHandle? = nil, onProgress: ProgressCallback? = nil) async throws {
        let bin = try requireSevenZip()
        try FileManager.default.createDirectory(at: dest, withIntermediateDirectories: true)
        let args = [flat ? "e" : "x", "-bsp1", "-sccUTF-8", "-y", overwrite.flag, "-o\(dest.path)"]
            + pw(password) + ["--", archive.path] + files
        let r = try await run(bin, args, handle: handle, onProgress: onProgress)
        if r.code > 1 { throw failure(r, "Ошибка распаковки") }
    }

    static func test(_ archive: URL, password: String?, handle: OperationHandle? = nil,
                     onProgress: ProgressCallback? = nil) async throws {
        let bin = try requireSevenZip()
        let r = try await run(bin, ["t", "-bsp1", "-sccUTF-8"] + pw(password) + ["--", archive.path],
                              handle: handle, onProgress: onProgress)
        if r.code != 0 { throw failure(r, "Архив повреждён") }
    }

    /// Создание архива или добавление в существующий. Файлы кладутся относительно их родительской папки.
    static func add(_ o: AddOptions, handle: OperationHandle? = nil, onProgress: ProgressCallback? = nil) async throws {
        guard let first = o.files.first else { throw ArchiveError(message: "Нет файлов для добавления") }
        let cwd = first.deletingLastPathComponent()
        let rel = o.files.map { $0.deletingLastPathComponent().path == cwd.path ? $0.lastPathComponent : $0.path }
        let password = (o.password?.isEmpty == false) ? o.password : nil

        if o.format == .rar {
            guard let rar else {
                throw ArchiveError(message: "Для создания RAR нужна утилита rar от RARLAB.\nУстановите: brew install rar\n(распаковка RAR работает и без неё)")
            }
            var args = ["a", "-y", "-m\(o.level.rarLevel)", "-ep1", "-r"]
            if let password { args.append(o.encryptNames ? "-hp\(password)" : "-p\(password)") }
            if o.solid { args.append("-s") }
            if o.deleteAfter { args.append("-df") }
            if let v = o.volumeSize { args.append("-v\(v)") }
            args += ["--", o.archive.path] + rel
            let r = try await run(rar, args, cwd: cwd, handle: handle, onProgress: onProgress)
            if r.code != 0 { throw failure(r, "Ошибка создания RAR") }
            return
        }

        let bin = try requireSevenZip()
        var args = ["a", "-bsp1", "-sccUTF-8", "-y", "-t\(o.format.rawValue)", "-mx=\(o.level.sevenZipLevel)"]
        if let password {
            args.append("-p\(password)")
            if o.format == .sevenZ && o.encryptNames { args.append("-mhe=on") }
            if o.format == .zip { args.append("-mem=AES256") }
        }
        if o.format == .sevenZ { args.append("-ms=\(o.solid ? "on" : "off")") }
        if o.deleteAfter { args.append("-sdel") }
        if let v = o.volumeSize { args.append("-v\(v)") }
        args += ["--", o.archive.path] + rel
        let r = try await run(bin, args, cwd: cwd, handle: handle, onProgress: onProgress)
        if r.code > 1 { throw failure(r, "Ошибка создания архива") }
    }

    static func delete(from archive: URL, files: [String], type: String, password: String?) async throws {
        if type.lowercased().contains("rar") || archive.pathExtension.lowercased() == "rar" {
            guard let rar else { throw ArchiveError(message: "Удаление из RAR требует утилиту rar (brew install rar)") }
            let r = try await run(rar, ["d", "-y"] + pw(password) + ["--", archive.path] + files)
            if r.code != 0 { throw failure(r, "Ошибка удаления") }
            return
        }
        let bin = try requireSevenZip()
        let r = try await run(bin, ["d", "-sccUTF-8", "-y"] + pw(password) + ["--", archive.path] + files)
        if r.code > 1 { throw failure(r, "Ошибка удаления") }
    }
}

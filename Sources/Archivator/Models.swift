import Foundation

enum ArchiveFormat: String, CaseIterable, Identifiable {
    case zip, sevenZ = "7z", rar
    var id: String { rawValue }
    var title: String { rawValue.uppercased() }

    static func from(url: URL) -> ArchiveFormat? {
        ArchiveFormat(rawValue: url.pathExtension.lowercased())
    }
}

enum CompressionLevel: String, CaseIterable, Identifiable {
    case store, fastest, fast, normal, good, best
    var id: String { rawValue }
    var title: String {
        switch self {
        case .store: return "Без сжатия"
        case .fastest: return "Скоростной"
        case .fast: return "Быстрый"
        case .normal: return "Обычный"
        case .good: return "Хороший"
        case .best: return "Максимальный"
        }
    }
    /// Ключ -mx для 7-Zip
    var sevenZipLevel: Int {
        switch self {
        case .store: return 0
        case .fastest: return 1
        case .fast: return 3
        case .normal: return 5
        case .good: return 7
        case .best: return 9
        }
    }
    /// Ключ -m для rar
    var rarLevel: Int {
        switch self {
        case .store: return 0
        case .fastest: return 1
        case .fast: return 2
        case .normal: return 3
        case .good: return 4
        case .best: return 5
        }
    }
}

enum OverwriteMode: String, CaseIterable, Identifiable {
    case overwrite, skip, rename
    var id: String { rawValue }
    var title: String {
        switch self {
        case .overwrite: return "Перезаписывать без запроса"
        case .skip: return "Пропускать существующие"
        case .rename: return "Переименовывать автоматически"
        }
    }
    var flag: String {
        switch self {
        case .overwrite: return "-aoa"
        case .skip: return "-aos"
        case .rename: return "-aou"
        }
    }
}

/// Запись из листинга архива
struct ArchiveEntry {
    var path: String
    var isDir: Bool
    var size: Int64
    var packed: Int64
    var modified: Date?
    var crc: String
    var encrypted: Bool
    var method: String
}

struct ArchiveListing {
    var type: String
    var physicalSize: Int64
    var solid: Bool
    var entries: [ArchiveEntry]
}

struct OpenArchive {
    var url: URL
    var listing: ArchiveListing
    var password: String?
}

/// Строка в таблице: файл на диске либо элемент внутри архива
struct Row: Identifiable, Hashable {
    var id: String
    var name: String
    var isDir: Bool
    var isUp = false
    var isArchive = false
    var size: Int64 = 0
    var packed: Int64 = 0
    var modified: Date = .distantPast
    var crc: String = ""
    var encrypted = false
    var typeName: String = ""
    /// Путь на диске (режим папки) или путь внутри архива
    var target: String

    var ext: String { (name as NSString).pathExtension.lowercased() }
}

struct AddOptions {
    var archive: URL
    var files: [URL]
    var format: ArchiveFormat
    var level: CompressionLevel = .normal
    var password: String? = nil
    var encryptNames = false
    var deleteAfter = false
    var solid = true
    var volumeSize: String? = nil
}

struct ExtractOptions {
    var dest: URL
    var overwrite: OverwriteMode
    var password: String?
}

let archiveExtensions: Set<String> = ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "cab", "iso", "jar"]

func isArchive(_ url: URL) -> Bool {
    archiveExtensions.contains(url.pathExtension.lowercased())
}

func isArchive(name: String) -> Bool {
    archiveExtensions.contains((name as NSString).pathExtension.lowercased())
}

/// Имя без расширения (с учётом .tar.gz)
func stripExt(_ name: String) -> String {
    var n = (name as NSString).deletingPathExtension
    if n.lowercased().hasSuffix(".tar") { n = (n as NSString).deletingPathExtension }
    return n.isEmpty ? name : n
}

enum Fmt {
    static let bytesFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.locale = Locale(identifier: "ru_RU")
        return f
    }()

    static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "dd.MM.yyyy HH:mm"
        return f
    }()

    static func size(_ n: Int64) -> String { bytesFormatter.string(from: NSNumber(value: n)) ?? "\(n)" }

    static func short(_ n: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: n, countStyle: .file)
    }

    static func date(_ d: Date) -> String { d == .distantPast ? "" : dateFormatter.string(from: d) }
}

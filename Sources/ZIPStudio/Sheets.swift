import AppKit
import SwiftUI

private struct VolumeOption: Hashable {
    var value: String
    var label: String
}

private let volumeOptions = [
    VolumeOption(value: "", label: "Не разбивать"),
    VolumeOption(value: "10m", label: "10 МБ"),
    VolumeOption(value: "100m", label: "100 МБ"),
    VolumeOption(value: "700m", label: "700 МБ (CD)"),
    VolumeOption(value: "4092m", label: "4092 МБ (FAT32)"),
    VolumeOption(value: "4480m", label: "4,7 ГБ (DVD)"),
]

// MARK: - Создание архива

struct AddSheet: View {
    let files: [URL]
    let rarAvailable: Bool
    let onOK: (AddOptions) -> Void
    let onCancel: () -> Void

    @State private var name: String
    @State private var format: ArchiveFormat = .zip
    @State private var level: CompressionLevel = .normal
    @State private var volume = ""
    @State private var deleteAfter = false
    @State private var solid = true
    @State private var password = ""
    @State private var password2 = ""
    @State private var encryptNames = false
    @State private var error: String?

    init(files: [URL], rarAvailable: Bool, onOK: @escaping (AddOptions) -> Void, onCancel: @escaping () -> Void) {
        self.files = files
        self.rarAvailable = rarAvailable
        self.onOK = onOK
        self.onCancel = onCancel
        let dir = files.first?.deletingLastPathComponent() ?? FileManager.default.homeDirectoryForCurrentUser
        let base: String
        if files.count == 1, let f = files.first {
            base = stripExt(f.lastPathComponent)
        } else {
            base = dir.lastPathComponent.isEmpty ? "Архив" : dir.lastPathComponent
        }
        _name = State(initialValue: dir.appendingPathComponent(base + ".zip").path)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                ToolIcon(name: "add", fallback: "plus.rectangle.on.folder.fill")
                Text("Имя и параметры архива").font(.title3.bold())
            }
            TabView {
                general.tabItem { Text("Общие") }
                advanced.tabItem { Text("Пароль и дополнительно") }
            }
            .frame(height: 290)

            if let error {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
            }
            HStack {
                Text("Файлов: \(files.count)").foregroundStyle(.secondary)
                Spacer()
                Button("Отмена", action: onCancel).keyboardShortcut(.cancelAction)
                Button("OK", action: submit).keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 560)
        .onChange(of: format) { f in
            let url = URL(fileURLWithPath: name)
            let known = ["zip", "7z", "rar"].contains(url.pathExtension.lowercased())
            name = (known ? url.deletingPathExtension() : url).appendingPathExtension(f.rawValue).path
            if f == .zip { encryptNames = false }
        }
    }

    private var general: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Имя архива")
            HStack {
                TextField("", text: $name)
                Button("Обзор…", action: browse)
            }
            HStack(alignment: .top, spacing: 14) {
                GroupBox("Формат архива") {
                    Picker("", selection: $format) {
                        ForEach(ArchiveFormat.allCases) { f in
                            Text(f == .rar && !rarAvailable ? "RAR (нужна утилита rar)" : f.title).tag(f)
                        }
                    }
                    .pickerStyle(.radioGroup)
                    .labelsHidden()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(4)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("Метод сжатия")
                    Picker("", selection: $level) {
                        ForEach(CompressionLevel.allCases) { Text($0.title).tag($0) }
                    }
                    .labelsHidden()
                    Text("Разделить на тома размером")
                    Picker("", selection: $volume) {
                        ForEach(volumeOptions, id: \.value) { Text($0.label).tag($0.value) }
                    }
                    .labelsHidden()
                }
            }
            GroupBox("Параметры архивации") {
                VStack(alignment: .leading, spacing: 4) {
                    Toggle("Удалить файлы после упаковки", isOn: $deleteAfter)
                    Toggle("Создать непрерывный (solid) архив", isOn: $solid)
                        .disabled(format == .zip)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(4)
            }
        }
        .padding(12)
    }

    private var advanced: some View {
        VStack(alignment: .leading, spacing: 10) {
            GroupBox("Шифрование") {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Пароль")
                    SecureField("", text: $password)
                    Text("Повторите пароль")
                    SecureField("", text: $password2)
                    Toggle("Шифровать имена файлов", isOn: $encryptNames)
                        .disabled(format == .zip || password.isEmpty)
                    Text(format == .zip
                         ? "ZIP шифруется AES-256; имена файлов в ZIP не шифруются."
                         : "При шифровании имён без пароля нельзя даже увидеть список файлов.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(4)
            }
            Spacer()
        }
        .padding(12)
    }

    private func browse() {
        let panel = NSSavePanel()
        let url = URL(fileURLWithPath: name)
        panel.directoryURL = url.deletingLastPathComponent()
        panel.nameFieldStringValue = url.lastPathComponent
        if panel.runModal() == .OK, let u = panel.url { name = u.path }
    }

    private func submit() {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { error = "Укажите имя архива"; return }
        guard password == password2 else { error = "Пароли не совпадают"; return }
        if format == .rar && !rarAvailable { error = "Для RAR нужна утилита rar. " + ArchiveEngine.rarInstallHint; return }
        onOK(AddOptions(archive: URL(fileURLWithPath: (trimmed as NSString).expandingTildeInPath),
                        files: files, format: format, level: level,
                        password: password.isEmpty ? nil : password,
                        encryptNames: encryptNames, deleteAfter: deleteAfter, solid: solid,
                        volumeSize: volume.isEmpty ? nil : volume))
    }
}

// MARK: - Извлечение

struct ExtractSheet: View {
    let request: ExtractRequest
    let onOK: (ExtractOptions) -> Void
    let onCancel: () -> Void

    @State private var dest: String
    @State private var overwrite: OverwriteMode = .overwrite
    @State private var password = ""

    init(request: ExtractRequest, onOK: @escaping (ExtractOptions) -> Void, onCancel: @escaping () -> Void) {
        self.request = request
        self.onOK = onOK
        self.onCancel = onCancel
        _dest = State(initialValue: request.defaultDest.path)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                ToolIcon(name: "extract", fallback: "folder.fill")
                Text("Путь и параметры извлечения").font(.title3.bold())
            }
            Text("Путь для извлечения (будет создан, если не существует)")
            HStack {
                TextField("", text: $dest)
                Button("Обзор…", action: browse)
            }
            HStack(alignment: .top, spacing: 14) {
                GroupBox("Режим перезаписи") {
                    Picker("", selection: $overwrite) {
                        ForEach(OverwriteMode.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.radioGroup)
                    .labelsHidden()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(4)
                }
                GroupBox("Пароль (если нужен)") {
                    VStack(alignment: .leading, spacing: 6) {
                        SecureField("", text: $password)
                        Text("Извлекается: \(request.summary)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    .padding(4)
                }
            }
            HStack {
                Spacer()
                Button("Отмена", action: onCancel).keyboardShortcut(.cancelAction)
                Button("OK") {
                    let d = dest.trimmingCharacters(in: .whitespaces)
                    guard !d.isEmpty else { return }
                    onOK(ExtractOptions(dest: URL(fileURLWithPath: (d as NSString).expandingTildeInPath),
                                        overwrite: overwrite,
                                        password: password.isEmpty ? nil : password))
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 560)
    }

    private func browse() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = true
        panel.directoryURL = URL(fileURLWithPath: dest).deletingLastPathComponent()
        if panel.runModal() == .OK, let u = panel.url { dest = u.path }
    }
}

// MARK: - Пароль

struct PasswordSheet: View {
    let archiveName: String
    let onOK: (String) -> Void
    let onCancel: () -> Void

    @State private var password = ""
    @State private var show = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "lock.fill").font(.system(size: 26)).foregroundStyle(Theme.accent)
                VStack(alignment: .leading) {
                    Text("Ввод пароля").font(.title3.bold())
                    Text("Архив «\(archiveName)» зашифрован").foregroundStyle(.secondary)
                }
            }
            Group {
                if show {
                    TextField("Пароль", text: $password)
                } else {
                    SecureField("Пароль", text: $password)
                }
            }
            .focused($focused)
            .onSubmit { if !password.isEmpty { onOK(password) } }
            Toggle("Показывать пароль", isOn: $show)
            HStack {
                Spacer()
                Button("Отмена", action: onCancel).keyboardShortcut(.cancelAction)
                Button("OK") { onOK(password) }
                    .keyboardShortcut(.defaultAction)
                    .disabled(password.isEmpty)
            }
        }
        .padding(20)
        .frame(width: 400)
        .onAppear { focused = true }
    }
}

// MARK: - Информация

struct InfoSheet: View {
    @ObservedObject var model: AppModel
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let a = model.archive, let st = model.archiveStats {
                let archSize = a.listing.physicalSize > 0 ? a.listing.physicalSize : st.packed
                let ratio = st.size > 0 ? Double(archSize) / Double(st.size) : 0
                HStack(spacing: 12) {
                    Image(nsImage: NSApp.applicationIconImage).resizable().frame(width: 52, height: 52)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(a.url.lastPathComponent).font(.title3.bold())
                        Text(a.url.deletingLastPathComponent().path)
                            .font(.caption).foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                }
                Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 6) {
                    infoRow("Формат", a.listing.type)
                    infoRow("Файлов", Fmt.size(Int64(st.files)))
                    infoRow("Папок", Fmt.size(Int64(st.folders)))
                    infoRow("Исходный размер", "\(Fmt.short(st.size)) (\(Fmt.size(st.size)) байт)")
                    infoRow("Размер архива", "\(Fmt.short(archSize)) (\(Fmt.size(archSize)) байт)")
                    infoRow("Степень сжатия", "\(Int((ratio * 100).rounded()))%")
                    infoRow("Непрерывный", a.listing.solid ? "да" : "нет")
                    infoRow("Шифрование", st.encrypted || a.password != nil ? "есть" : "нет")
                }
                ProgressView(value: min(ratio, 1))
            } else {
                Text("Архив не открыт")
            }
            HStack {
                Spacer()
                Button("OK", action: onClose).keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 440)
    }

    private func infoRow(_ title: String, _ value: String) -> some View {
        GridRow {
            Text(title).foregroundStyle(.secondary)
            Text(value).textSelection(.enabled)
        }
    }
}

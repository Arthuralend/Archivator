import AppKit
import SwiftUI

@main
struct ZIPStudioApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model = AppModel.shared

    var body: some Scene {
        Window("ZIP Studio", id: "main") {
            ContentView(model: model)
        }
        .defaultSize(width: 1000, height: 640)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Открыть архив…") { model.cmdOpen() }
                    .keyboardShortcut("o")
                Button("Сменить папку…") { model.cmdChangeDir() }
                    .keyboardShortcut("d")
            }
            CommandMenu("Команды") {
                Button("Добавить файлы в архив…") { model.cmdAdd() }
                    .keyboardShortcut("a", modifiers: [.command, .option])
                Button("Извлечь в указанную папку…") { model.cmdExtract() }
                    .keyboardShortcut("e", modifiers: [.command, .option])
                Button("Проверить архив") { model.cmdTest() }
                    .keyboardShortcut("t", modifiers: [.command, .option])
                Button("Просмотреть файл") { model.cmdView() }
                    .keyboardShortcut("v", modifiers: [.command, .option])
                Button("Удалить") { model.cmdDelete() }
                    .keyboardShortcut(.delete, modifiers: .command)
                Divider()
                Button("Найти") { model.showFind.toggle() }
                    .keyboardShortcut("f")
                Button("Информация об архиве") { model.cmdInfo() }
                    .keyboardShortcut("i")
                Button("Мастер…") { model.cmdWizard() }
                Divider()
                Button("На уровень вверх") { model.goUp() }
                    .keyboardShortcut(.upArrow, modifiers: .command)
            }
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var launched = false
    private var pending: [URL] = []

    func applicationWillFinishLaunching(_ notification: Notification) {
        // Запуск через `swift run` (без .app): делаем обычным приложением и ставим иконку из Resources
        if Bundle.main.bundleIdentifier == nil {
            NSApp.setActivationPolicy(.regular)
            let icon = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
                .appendingPathComponent("Resources/AppIcon.png")
            if let img = NSImage(contentsOf: icon) { NSApp.applicationIconImage = img }
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.activate(ignoringOtherApps: true)
        launched = true
        if let url = pending.first { AppModel.shared.openAny(url) }
        pending = []
    }

    /// Открытие архива из Finder («Открыть с помощью», двойной клик)
    func application(_ application: NSApplication, open urls: [URL]) {
        if launched {
            if let url = urls.first { AppModel.shared.openAny(url) }
        } else {
            pending += urls
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

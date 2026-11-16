import AppKit
import SwiftUI

/// Палитра в цветах Claude: терракотовый акцент, тёплый кремовый фон, графитовый тёмный режим.
enum Theme {
    private static func dynamic(light: NSColor, dark: NSColor) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
        })
    }

    private static func rgb(_ hex: UInt32) -> NSColor {
        NSColor(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255,
                alpha: 1)
    }

    /// Фирменный терракотовый
    static let accent = dynamic(light: rgb(0xD97757), dark: rgb(0xE2886A))
    /// Фон окна и панелей
    static let window = dynamic(light: rgb(0xF0EEE6), dark: rgb(0x262624))
    /// Верх градиента панели инструментов
    static let toolbarTop = dynamic(light: rgb(0xFAF9F5), dark: rgb(0x30302E))
    /// Фон списка файлов и полей ввода
    static let surface = dynamic(light: rgb(0xFAF9F5), dark: rgb(0x1F1E1D))
    /// Рамки и разделители
    static let border = dynamic(light: rgb(0xDAD6CA), dark: rgb(0x3E3D39))
    /// Второстепенный текст
    static let muted = dynamic(light: rgb(0x73726C), dark: rgb(0xA6A39A))
}

/// Картинки кнопок панели из Resources/Toolbar (в .app — Contents/Resources/Toolbar)
@MainActor
enum ToolbarIcons {
    private static var cache: [String: NSImage] = [:]

    static func image(_ name: String) -> NSImage? {
        if let img = cache[name] { return img }
        var candidates: [URL] = []
        if let res = Bundle.main.resourceURL {
            candidates.append(res.appendingPathComponent("Toolbar/\(name).png"))
        }
        candidates.append(URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            .appendingPathComponent("Resources/Toolbar/\(name).png"))
        for url in candidates {
            if let img = NSImage(contentsOf: url) {
                cache[name] = img
                return img
            }
        }
        return nil
    }
}

/// Иконка кнопки: картинка из набора, а если её нет — SF Symbol
struct ToolIcon: View {
    let name: String
    let fallback: String
    var size: CGFloat = 36

    var body: some View {
        if let img = ToolbarIcons.image(name) {
            Image(nsImage: img)
                .resizable()
                .interpolation(.high)
                .frame(width: size, height: size)
                .shadow(color: .black.opacity(0.12), radius: 1, y: 1)
        } else {
            Image(systemName: fallback)
                .font(.system(size: size * 0.7))
                .foregroundStyle(Theme.accent)
                .frame(width: size, height: size)
        }
    }
}

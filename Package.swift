// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ZIPStudio",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "ZIPStudio",
            path: "Sources/ZIPStudio"
        )
    ]
)

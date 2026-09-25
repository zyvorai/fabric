// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "KeepKit",
    platforms: [.macOS(.v14)],
    products: [.library(name: "KeepKit", targets: ["KeepKit"])],
    targets: [
        .target(name: "KeepKit", path: "Sources/KeepKit"),
        .testTarget(
            name: "KeepKitTests",
            dependencies: ["KeepKit"],
            path: "Tests/KeepKitTests",
            resources: [.copy("Fixtures")]
        ),
    ]
)

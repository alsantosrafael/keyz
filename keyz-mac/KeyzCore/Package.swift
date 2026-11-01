// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "KeyzCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "KeyzCore", targets: ["KeyzCore"]),
    ],
    targets: [
        .target(name: "KeyzCore"),
        .testTarget(name: "KeyzCoreTests", dependencies: ["KeyzCore"]),
    ]
)

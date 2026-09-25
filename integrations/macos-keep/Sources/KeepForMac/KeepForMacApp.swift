import AppKit
import KeepKit
import SwiftUI

@main
struct KeepForMacApp: App {
    @StateObject private var app = AppState.shared
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        Window("Keep for Mac", id: "main") {
            RootView().environmentObject(app)
                .onOpenURL { handle($0) }
        }
        .commands { CommandGroup(replacing: .newItem) {} }
        MenuBarExtra("Keep", systemImage: app.approvals.isEmpty ? "lock.shield" : "lock.shield.fill") {
            MenuBarView().environmentObject(app)
        }
        .menuBarExtraStyle(.window)
    }

    /// keep://run?usecase=pdf-brief&path=/Users/me/report.pdf
    private func handle(_ url: URL) {
        guard url.scheme == "keep", url.host == "run", let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              let demo = items.first(where: { $0.name == "usecase" })?.value, let path = items.first(where: { $0.name == "path" })?.value else { return }
        app.run(demo: demo, files: [URL(fileURLWithPath: path)], source: "url")
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let services = ServicesProvider()
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.servicesProvider = services
        NSUpdateDynamicServices()
    }
    /// Files dropped on the Dock icon or opened with the app.
    func application(_ application: NSApplication, open urls: [URL]) {
        Task { @MainActor in DropRouter.route(urls.filter { $0.isFileURL }, app: AppState.shared) }
    }
}

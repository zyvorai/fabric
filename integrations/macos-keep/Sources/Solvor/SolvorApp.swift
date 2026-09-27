import AppKit
import KeepKit
import SwiftUI

@main
struct SolvorApp: App {
    @StateObject private var app = AppState.shared
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        Window("Solvor", id: "main") {
            RootView().environmentObject(app)
                .tint(Brand.orange)
                .onOpenURL { handle($0) }
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Read Email from Browser…") { app.sheet = .email }.keyboardShortcut("e", modifiers: [.command, .shift]).disabled(!app.connected)
                Button("Talk to Solvor…") { app.sheet = .voice }.keyboardShortcut("v", modifiers: [.command, .shift]).disabled(!app.connected)
            }
            CommandGroup(replacing: .appInfo) { Button("About Solvor") { app.sheet = .about } }
        }
        MenuBarExtra {
            MenuBarView().environmentObject(app).tint(Brand.orange)
        } label: {
            Image("MenuBarGlyph").renderingMode(.template)
        }
        .menuBarExtraStyle(.window)
    }

    /// keep://run?usecase=pdf-brief&path=/Users/me/report.pdf, and keep://connect?host=…&token=… (which only asks the person; it never connects by itself).
    private func handle(_ url: URL) {
        if let link = ConnectionLink(url: url) { app.offer(link: link); return }
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

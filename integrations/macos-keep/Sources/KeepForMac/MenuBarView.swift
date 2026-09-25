import AppKit
import KeepKit
import SwiftUI

/// The menu-bar item: a drop zone, the last runs, pending approvals, and "run the clipboard".
struct MenuBarView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.openWindow) private var openWindow
    @State private var targeted = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            RoundedRectangle(cornerRadius: 8).strokeBorder(targeted ? Color.accentColor : Color.gray.opacity(0.5), style: StrokeStyle(lineWidth: 2, dash: [6]))
                .frame(height: 64).overlay(Text("Drop a file to summarise it").font(.callout))
                .dropDestination(for: URL.self) { urls, _ in DropRouter.route(urls, app: app); return true } isTargeted: { targeted = $0 }
            if app.approvals.count > 0 {
                Button("\(app.approvals.count) approval\(app.approvals.count == 1 ? "" : "s") waiting") { NSApp.activate(ignoringOtherApps: true); openWindow(id: "main") }
            }
            ForEach(app.jobs.prefix(3)) { job in
                HStack {
                    switch job.state { case .running: ProgressView().controlSize(.mini); case .done: Image(systemName: "checkmark.circle"); case .failed: Image(systemName: "xmark.octagon") }
                    Text(app.demo(job.demo)?.title ?? job.demo).lineLimit(1)
                }
            }
            Divider()
            Menu("Run the clipboard as…") {
                ForEach(app.demos.filter { $0.accepts.contains("txt") }) { d in Button(d.title) { runClipboard(d) } }
            }.disabled(!app.connected || NSPasteboard.general.string(forType: .string) == nil)
            Button("Open Keep for Mac") { NSApp.activate(ignoringOtherApps: true); openWindow(id: "main") }
            Button("Quit") { NSApp.terminate(nil) }
        }.padding(12).frame(width: 300)
    }

    private func runClipboard(_ demo: Demo) {
        guard let text = NSPasteboard.general.string(forType: .string) else { return }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("clipboard.txt")
        do { try text.write(to: url, atomically: true, encoding: .utf8); app.run(demo: demo.id, files: [url], source: "clipboard") } catch { app.notice = error.localizedDescription }
    }
}

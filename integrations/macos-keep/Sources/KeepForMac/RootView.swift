import KeepKit
import SwiftUI

enum Pane: String, CaseIterable, Identifiable {
    case useCases = "Use cases", runs = "Runs", approvals = "Approvals", folders = "Watch folders", settings = "Settings"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .useCases: return "square.grid.2x2"
        case .runs: return "clock.arrow.circlepath"
        case .approvals: return "checkmark.seal"
        case .folders: return "folder.badge.gearshape"
        case .settings: return "gearshape"
        }
    }
}

struct RootView: View {
    @EnvironmentObject var app: AppState
    @State private var section: Pane? = .useCases

    var body: some View {
        NavigationSplitView {
            List(selection: $section) {
                Label("Use cases", systemImage: Pane.useCases.icon).tag(Pane.useCases)
                Label("Runs", systemImage: Pane.runs.icon).tag(Pane.runs)
                Label { Text("Approvals") } icon: { Image(systemName: Pane.approvals.icon) }.badge(app.approvals.count).tag(Pane.approvals)
                Label("Watch folders", systemImage: Pane.folders.icon).tag(Pane.folders)
                Label("Settings", systemImage: Pane.settings.icon).tag(Pane.settings)
                if !app.jobs.isEmpty {
                    Section("This session") {
                        ForEach(app.jobs.prefix(8)) { job in
                            HStack {
                                switch job.state {
                                case .running: ProgressView().controlSize(.small)
                                case .done: Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                                case .failed: Image(systemName: "xmark.octagon.fill").foregroundStyle(.red)
                                }
                                Text(app.demo(job.demo)?.title ?? job.demo).lineLimit(1)
                            }
                            .contentShape(Rectangle())
                            .onTapGesture { app.selectedJob = job.id; section = nil }
                        }
                    }
                }
            }
            .navigationSplitViewColumnWidth(min: 200, ideal: 220)
            .safeAreaInset(edge: .bottom) { ConnectionStrip() }
        } detail: {
            Group {
                if let id = app.selectedJob, section == nil, let job = app.jobs.first(where: { $0.id == id }) { ResultView(job: job) }
                else if !app.connected && section != .settings { NotConnectedView(open: { section = .settings }) }
                else {
                    switch section ?? .useCases {
                    case .useCases: UseCasesView()
                    case .runs: RunsView()
                    case .approvals: ApprovalsView()
                    case .folders: WatchFoldersView()
                    case .settings: SettingsView()
                    }
                }
            }
        }
        .frame(minWidth: 900, minHeight: 560)
        .task { if !app.connected { await app.connect() } }
        .onChange(of: app.selectedJob) { _, new in if new != nil { section = nil } }
        .alert("Check before uploading", isPresented: Binding(get: { app.pendingSecretWarning != nil }, set: { if !$0 { app.pendingSecretWarning = nil } })) {
            Button("Upload anyway", role: .destructive) { app.confirmPending() }
            Button("Cancel", role: .cancel) { app.pendingSecretWarning = nil }
        } message: { Text((app.pendingSecretWarning?.findings ?? []).joined(separator: "\n")) }
        .alert("Keep", isPresented: Binding(get: { app.notice != nil }, set: { if !$0 { app.notice = nil } })) { Button("OK") { app.notice = nil } } message: { Text(app.notice ?? "") }
    }
}

struct ConnectionStrip: View {
    @EnvironmentObject var app: AppState
    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(app.connected ? Color.green : Color.orange).frame(width: 8, height: 8)
            Text(app.connected ? (URL(string: app.host)?.host ?? "connected") : "not connected").font(.caption).lineLimit(1)
            Spacer()
        }.padding(10).background(.bar)
    }
}

struct NotConnectedView: View {
    let open: () -> Void
    @EnvironmentObject var app: AppState
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "lock.shield").font(.system(size: 42)).foregroundStyle(.secondary)
            Text("Connect to a Keep host").font(.title2.bold())
            Text("Keep runs each file in a sealed cell on a host you run. Enter its address and a user token.").foregroundStyle(.secondary)
            if let e = app.connectionError { Text(e).foregroundStyle(.red).font(.callout) }
            Button("Open Settings", action: open).buttonStyle(.borderedProminent)
        }.frame(maxWidth: 420).frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

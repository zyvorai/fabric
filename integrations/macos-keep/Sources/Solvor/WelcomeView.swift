import KeepKit
import SwiftUI

/// First run: what Solvor is, and how to connect.
struct WelcomeView: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 22) {
            LogoTile(size: 88)
            VStack(spacing: 6) {
                Text("Welcome to Solvor").font(.system(size: 30, weight: .bold, design: .rounded))
                Text("Drop a file. It is read inside a sealed cell that has no network. You get the answer, and the proof.").multilineTextAlignment(.center).foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 14) {
                step("1", "Connect", "Add the address of your Keep host and a user token in Settings. The token stays in your Keychain.", "link")
                step("2", "Drop anything", "PDFs, statements, logs, chats, decks, or an email from your browser. Solvor suggests the right use case.", "square.and.arrow.down")
                step("3", "See the proof", "Every result shows how many outbound connections the cell made: zero.", "lock.shield")
            }
            .padding(18).card()
            HStack {
                Button("Open Settings") { app.pane = .settings; app.welcomed = true; dismiss() }.primaryButton().controlSize(.large)
                Button("Later") { app.welcomed = true; dismiss() }.secondaryButton().controlSize(.large)
            }
        }
        .padding(30).frame(width: 520)
    }

    private func step(_ n: String, _ title: String, _ text: String, _ icon: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            AccentTile(symbol: icon, size: 34)
            VStack(alignment: .leading, spacing: 2) { Text(title).font(.headline); Text(text).font(.callout).foregroundStyle(.secondary) }
        }
    }
}

struct AboutView: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(spacing: 14) {
            LogoTile(size: 96)
            Text("Solvor").font(.system(size: 28, weight: .bold, design: .rounded))
            Text("A Mac client for Keep").foregroundStyle(.secondary)
            Text("Files you choose are uploaded to the Keep host you configured and read in a sealed cell with no network. The evidence class is software-test: whoever operates the host could still read a cell's memory. Solvor never runs commands on your Mac, never sends or replies to mail, and never approves anything by voice.")
                .font(.callout).multilineTextAlignment(.center).foregroundStyle(.secondary)
            Text("Version 0.1 · Apache-2.0").font(.caption).foregroundStyle(.tertiary)
            Button("Close") { dismiss() }.keyboardShortcut(.defaultAction)
        }.padding(28).frame(width: 440)
    }
}

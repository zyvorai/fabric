import AppKit
import KeepKit
import SwiftUI

/// The outcome of a job: one card per file, each with its summary and the honesty line.
struct ResultView: View {
    let job: Job
    @EnvironmentObject var app: AppState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text(app.demo(job.demo)?.title ?? job.demo).font(.title2.bold())
                    Spacer()
                    Text(job.source).font(.caption).foregroundStyle(.secondary)
                }
                switch job.state {
                case .running:
                    HStack { ProgressView(); Text("Running in a sealed cell. A cold cell takes about 15 to 25 seconds.") }
                case .failed(let message):
                    Label(message, systemImage: "exclamationmark.triangle").foregroundStyle(.red).textSelection(.enabled)
                case .done(let outcome):
                    ProofBadge(egress: outcome.egressConnects, evidence: outcome.items.first?.result?.badge?.evidence)
                    ForEach(Array(outcome.items.enumerated()), id: \.offset) { _, item in FileResultCard(item: item) }
                }
            }
            .padding(20)
        }
    }
}

struct ProofBadge: View {
    let egress: Int
    let evidence: String?
    var body: some View {
        HStack(spacing: 10) {
            Label("\(egress) outbound connections", systemImage: egress == 0 ? "lock.shield" : "exclamationmark.shield")
                .foregroundStyle(egress == 0 ? .green : .red)
            if let evidence { Text("evidence: \(evidence)").foregroundStyle(.secondary) }
            Text("the host's operator can still read a cell's memory").foregroundStyle(.secondary)
        }
        .font(.callout)
    }
}

struct FileResultCard: View {
    let item: BatchItem
    @EnvironmentObject var app: AppState
    @State private var body_: String?
    @State private var title = ""
    @State private var error: String?

    var body: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Image(systemName: item.ok ? "checkmark.circle.fill" : "xmark.octagon.fill").foregroundStyle(item.ok ? .green : .red)
                    Text(item.filename).font(.headline)
                    Spacer()
                    if let text = body_ {
                        Button("Copy") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text, forType: .string) }
                        Button("Save…") { save(text) }
                    }
                }
                if let error = item.error ?? error { Text(error).foregroundStyle(.red) }
                if let text = body_ { MarkdownView(markdown: text) } else if item.ok { ProgressView() }
            }
            .padding(6)
        }
        .task(id: item.result?.sessionId) { await load() }
    }

    private func load() async {
        guard item.ok, let c = app.client, let refs = item.result?.artifacts else { return }
        // The summary is the Markdown artifact; otherwise the first one.
        guard let ref = refs.first(where: { $0.title.hasSuffix(".md") }) ?? refs.first else { return }
        do { let a = try await c.artifact(id: ref.id); title = a.title; body_ = a.body } catch { self.error = error.localizedDescription }
    }

    private func save(_ text: String) {
        let p = NSSavePanel(); p.nameFieldStringValue = (title.isEmpty ? "summary.md" : title); p.allowedContentTypes = []
        if p.runModal() == .OK, let url = p.url { try? text.write(to: url, atomically: true, encoding: .utf8) }
    }
}

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
                    Text(app.demo(job.demo)?.title ?? job.demo).font(.system(size: 26, weight: .bold, design: .rounded))
                    Spacer()
                    Text(job.source).font(.caption).foregroundStyle(.secondary)
                }
                switch job.state {
                case .running:
                    VStack(spacing: 6) {
                        SealedCellView(fileName: job.files.map(\.lastPathComponent).joined(separator: ", "))
                        Text("Reading it in a sealed cell that has no network").font(.headline)
                        Text("A cold cell takes about 15 to 25 seconds.").font(.callout).foregroundStyle(.secondary)
                    }.frame(maxWidth: .infinity)
                case .failed(let message):
                    Label(message, systemImage: "exclamationmark.triangle").foregroundStyle(.red).textSelection(.enabled)
                case .done(let outcome):
                    ProofPill(egress: outcome.egressConnects, evidence: outcome.items.first?.result?.badge?.evidence)
                    ForEach(Array(outcome.items.enumerated()), id: \.offset) { _, item in FileResultCard(item: item) }
                }
            }
            .padding(20)
        }
    }
}

struct FileResultCard: View {
    let item: BatchItem
    @EnvironmentObject var app: AppState
    @State private var body_: String?
    @State private var title = ""
    @State private var error: String?

    var body: some View {
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
        .padding(16).card()
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

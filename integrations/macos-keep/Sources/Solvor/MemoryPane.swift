import KeepKit
import SwiftUI

/// What Keep remembers about you. Off by default; an agent can only propose an entry, and nothing is used until you accept it. Needs a user token.
struct MemoryPane: View {
    @EnvironmentObject var app: AppState
    @State private var view = MemoryView(enabled: false, items: [], proposals: [])
    @State private var draft = ""
    @State private var kind = "note"
    @State private var message: String?
    @State private var forgetting = false

    var body: some View {
        List {
            if let message { Text(message).font(.callout).foregroundStyle(.red) }
            Section {
                Toggle("Remember things about me", isOn: Binding(get: { view.enabled }, set: { on in run { try await $0.setMemory(enabled: on) } }))
                Text("Off: your agents remember nothing about you. On: only what you add or accept below.").font(.caption).foregroundStyle(.secondary)
            }
            if view.enabled {
                Section("Add a note") {
                    HStack {
                        TextField("e.g. I prefer window seats", text: $draft)
                        Picker("", selection: $kind) { Text("Preference").tag("preference"); Text("Fact").tag("fact"); Text("Note").tag("note") }.labelsHidden().frame(width: 120)
                        Button("Remember") { let t = draft, k = kind; draft = ""; run { try await $0.addMemory(text: t, kind: k) } }
                            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
                if !view.proposals.isEmpty {
                    Section("Suggested by your agent") {
                        ForEach(view.proposals) { p in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(p.text)
                                if p.tainted == true { Label("Made by an agent that had read untrusted content.", systemImage: "exclamationmark.triangle").font(.caption).foregroundStyle(.orange) }
                                HStack {
                                    Button("Remember") { run { try await $0.decideMemoryProposal(p.id, accept: true) } }
                                    Button("No", role: .destructive) { run { try await $0.decideMemoryProposal(p.id, accept: false) } }
                                }.controlSize(.small)
                            }.padding(.vertical, 2)
                        }
                    }
                }
                Section("What it remembers") {
                    ForEach(view.items) { i in
                        HStack {
                            if i.isPinned { Image(systemName: "pin.fill").foregroundStyle(.secondary) }
                            VStack(alignment: .leading) { Text(i.text); Text(i.kind).font(.caption).foregroundStyle(.secondary) }
                            Spacer()
                            Button { run { try await $0.deleteMemory(i.id) } } label: { Image(systemName: "trash") }.buttonStyle(.borderless).help("Forget this")
                        }
                    }
                    if view.items.isEmpty { Text("Nothing yet.").foregroundStyle(.secondary) }
                }
                if !view.items.isEmpty || !view.proposals.isEmpty { Button("Forget everything", role: .destructive) { forgetting = true } }
            }
        }
        .navigationTitle("Memory")
        .toolbar { Button { Task { await load() } } label: { Image(systemName: "arrow.clockwise") } }
        .task { await load() }
        .confirmationDialog("Forget everything Keep remembers about you?", isPresented: $forgetting, titleVisibility: .visible) {
            Button("Forget everything", role: .destructive) { run { try await $0.forgetAllMemory() } }
        }
    }

    private func run(_ call: @escaping (KeepClient) async throws -> Void) {
        Task {
            guard let c = app.client else { return }
            do { try await call(c); message = nil } catch { message = error.localizedDescription }
            await load()
        }
    }

    private func load() async {
        guard let c = app.client else { return }
        do { view = try await c.memory(); message = nil } catch { message = error.localizedDescription }
    }
}

/// What was done after you approved things: what it was and how it ended, never the message. Read-only.
struct DonePane: View {
    @EnvironmentObject var app: AppState
    @State private var receipts: [Receipt] = []
    @State private var loaded = false
    @State private var message: String?

    var body: some View {
        List {
            if let message { Text(message).font(.callout).foregroundStyle(.red) }
            ForEach(receipts) { r in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text("\(r.method) \(r.host)\(r.path)").font(.callout.weight(.semibold)).lineLimit(2)
                        Spacer()
                        Text(String(r.status)).font(.caption.bold()).foregroundStyle(r.succeeded ? Color.green : Color.orange)
                    }
                    Text([r.agent, r.approved ? "approved by you" : nil, r.atDate?.formatted(.relative(presentation: .named))].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                }.padding(.vertical, 2)
            }
            if loaded && receipts.isEmpty { Text("Nothing yet. A send or a new event you approve shows up here.").foregroundStyle(.secondary) }
        }
        .navigationTitle("Done")
        .toolbar { Button { Task { await load() } } label: { Image(systemName: "arrow.clockwise") } }
        .task { await load() }
    }

    private func load() async {
        guard let c = app.client else { return }
        do { receipts = try await c.receipts(); loaded = true; message = nil } catch { message = error.localizedDescription }
    }
}

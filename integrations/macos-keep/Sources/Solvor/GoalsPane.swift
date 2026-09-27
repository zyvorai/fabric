import KeepKit
import SwiftUI

/// Your goals, the plans an agent proposed for them, and the suggestions agents made. Accepting one is a decision recorded on the host; it
/// starts nothing by itself, and a step that sends or spends still waits in Approvals. Needs a user token (Settings).
struct GoalsPane: View {
    @EnvironmentObject var app: AppState
    @State private var goals: [Goal] = []
    @State private var suggestions = SuggestionsView(enabled: false, pending: [])
    @State private var selected: String?
    @State private var message: String?
    @AppStorage("goalAgent") private var goalAgent = "echo-agent"
    @State private var newTitle = ""
    @State private var newSteps = ""
    @State private var confirmTaintedFor: ConfirmTainted?

    struct ConfirmTainted: Identifiable { let id = UUID(); let text: String; let action: () -> Void }

    var body: some View {
        HSplitView {
            List(selection: $selected) {
                Section("Suggestions") {
                    Toggle("Let agents suggest things", isOn: Binding(get: { suggestions.enabled }, set: { on in act { try await $0.setSuggestions(enabled: on) } }))
                    ForEach(suggestions.pending) { s in suggestionRow(s) }
                }
                Section("New goal") {
                    TextField("A goal, e.g. Plan the weekend trip", text: $newTitle)
                    TextField("Agent that does it", text: $goalAgent)
                    TextField("One step per line (or leave empty and ask the agent to plan)", text: $newSteps, axis: .vertical).lineLimit(1...4)
                    Button("Add goal") {
                        let title = newTitle.trimmingCharacters(in: .whitespaces)
                        let steps = newSteps.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                        newTitle = ""; newSteps = ""
                        act { _ = try await $0.createGoal(title: title, agent: goalAgent, steps: steps) }
                    }.disabled(newTitle.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                Section("Goals") {
                    ForEach(goals) { g in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack { Text(g.title).lineLimit(2); Spacer(); Text(g.status).font(.caption2.bold()).foregroundStyle(.secondary) }
                            if !g.steps.isEmpty { ProgressView(value: g.progress) }
                            else if g.proposedPlan != nil { Label("A plan is waiting for you", systemImage: "list.bullet.clipboard").font(.caption).foregroundStyle(.orange) }
                        }.tag(g.id)
                    }
                }
            }
            .frame(minWidth: 320, idealWidth: 360)
            detail
        }
        .navigationTitle("Goals")
        .toolbar { Button { Task { await load() } } label: { Image(systemName: "arrow.clockwise") } }
        .task { await load() }
        .confirmationDialog(confirmTaintedFor?.text ?? "", isPresented: Binding(get: { confirmTaintedFor != nil }, set: { if !$0 { confirmTaintedFor = nil } }), titleVisibility: .visible) {
            Button("Continue anyway") { confirmTaintedFor?.action(); confirmTaintedFor = nil }
        }
    }

    @ViewBuilder private var detail: some View {
        if let id = selected, let g = goals.first(where: { $0.id == id }) {
            List {
                if let message { Text(message).font(.callout).foregroundStyle(.red) }
                if let d = g.description, !d.isEmpty { Text(d) }
                if let p = g.proposedPlan {
                    Section {
                        ForEach(Array(p.steps.enumerated()), id: \.offset) { _, s in Text(s.title + (s.requiresApproval == true ? "  (asks you first)" : "")) }
                        if p.tainted == true { Label("The agent had read untrusted content while planning. Read every step first.", systemImage: "exclamationmark.triangle").foregroundStyle(.orange) }
                        HStack {
                            Button("Accept") { accept(g, p, autorun: false) }
                            Button("Accept and run") { accept(g, p, autorun: true) }
                            Button("Discard", role: .destructive) { act { try await $0.rejectPlan(goal: g.id) } }
                        }
                    } header: { Text("Proposed plan (nothing runs until you accept it)") }
                }
                if !g.steps.isEmpty {
                    Section("Steps") {
                        ForEach(g.steps) { s in
                            Label { VStack(alignment: .leading) { Text(s.title); if s.status == "blocked", let d = s.detail { Text(d).font(.caption).foregroundStyle(.secondary) } } }
                                icon: { Image(systemName: s.isDone ? "checkmark.circle.fill" : s.status == "blocked" ? "exclamationmark.circle.fill" : "circle").foregroundStyle(s.isDone ? .green : s.status == "blocked" ? .orange : .secondary) }
                        }
                    }
                }
                if g.needsPlan { Button(g.isPlanning ? "Planning…" : "Ask the agent for a plan") { act { try await $0.requestPlan(goal: g.id) } }.disabled(g.isPlanning) }
                if g.isOpen {
                    if !g.steps.isEmpty { Toggle("Run automatically", isOn: Binding(get: { g.autorun == true }, set: { on in act { try await $0.setGoalAutorun(g.id, on) } })) }
                    Button("Cancel goal", role: .destructive) { act { try await $0.cancelGoal(g.id) } }
                }
            }
        } else {
            Text("Select a goal, or make a suggestion into one.").foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func suggestionRow(_ s: Suggestion) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(s.title).font(.headline)
            if let r = s.reason, !r.isEmpty { Text(r).font(.callout).foregroundStyle(.secondary) }
            if s.tainted == true { Label("Made by an agent that had read untrusted content.", systemImage: "exclamationmark.triangle").font(.caption).foregroundStyle(.orange) }
            HStack {
                Button("Make it a goal") {
                    if s.tainted == true { confirmTaintedFor = ConfirmTainted(text: "An agent that had read untrusted content made this suggestion. Make it a goal anyway?") { act { try await $0.acceptSuggestion(s.id, confirmTainted: true) } } }
                    else { act { try await $0.acceptSuggestion(s.id) } }
                }
                Button("Dismiss", role: .destructive) { act { try await $0.dismissSuggestion(s.id) } }
            }.controlSize(.small)
        }.padding(.vertical, 3)
    }

    private func accept(_ g: Goal, _ p: ProposedPlan, autorun: Bool) {
        let go = { act { try await $0.acceptPlan(goal: g.id, confirmTainted: p.tainted == true, autorun: autorun) } }
        if p.tainted == true { confirmTaintedFor = ConfirmTainted(text: "The planner had read untrusted content. Accept this plan anyway?", action: go) } else { go() }
    }

    private func act(_ call: @escaping (KeepClient) async throws -> Void) {
        Task {
            guard let c = app.client else { return }
            do { try await call(c); message = nil } catch { message = error.localizedDescription }
            await load()
        }
    }

    private func load() async {
        guard let c = app.client else { return }
        do { async let g = c.goals(); async let s = c.suggestions(); (goals, suggestions) = try await (g, s); message = nil }
        catch { message = error.localizedDescription }
    }
}

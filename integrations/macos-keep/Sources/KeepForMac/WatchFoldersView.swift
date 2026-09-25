import KeepKit
import SwiftUI

struct WatchFoldersView: View {
    @EnvironmentObject var app: AppState
    @State private var editing: FolderRule?

    var body: some View {
        VStack(alignment: .leading) {
            Text("When a file that matches appears in a folder, Keep runs a use case on it once and can save the summary next to the file. The app must be running.")
                .foregroundStyle(.secondary).padding([.horizontal, .top])
            List {
                ForEach($app.folderRules) { $rule in
                    HStack {
                        Toggle("", isOn: $rule.enabled).labelsHidden()
                        VStack(alignment: .leading) {
                            Text(rule.folder.path).font(.headline)
                            Text("\(rule.patterns.joined(separator: ", "))  →  \(app.demo(rule.demo)?.title ?? rule.demo)").font(.callout).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Edit") { editing = rule }
                        Button(role: .destructive) { app.folderRules.removeAll { $0.id == rule.id } } label: { Image(systemName: "trash") }
                    }
                }
            }
            HStack { Spacer(); Button("Add a watched folder…") { pickFolder() }.buttonStyle(.borderedProminent) }.padding()
        }
        .navigationTitle("Watch folders")
        .sheet(item: $editing) { rule in RuleEditor(rule: rule) { updated in
            if let i = app.folderRules.firstIndex(where: { $0.id == updated.id }) { app.folderRules[i] = updated } else { app.folderRules.append(updated) }
        } }
    }

    private func pickFolder() {
        let p = NSOpenPanel(); p.canChooseFiles = false; p.canChooseDirectories = true; p.allowsMultipleSelection = false
        guard p.runModal() == .OK, let url = p.url else { return }
        editing = FolderRule(folder: url, patterns: ["*.pdf"], demo: app.demos.first { $0.id == "pdf-brief" }?.id ?? app.demos.first?.id ?? "pdf-brief")
    }
}

struct RuleEditor: View {
    @State var rule: FolderRule
    let save: (FolderRule) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var app: AppState
    @State private var patterns = ""

    var body: some View {
        Form {
            Text(rule.folder.path).font(.headline)
            Picker("Use case", selection: $rule.demo) { ForEach(app.demos) { Text($0.title).tag($0.id) } }
            TextField("File patterns (comma separated)", text: $patterns)
            Toggle("Save the summary next to the file (name.keep.md)", isOn: $rule.saveBesideFile)
            Toggle("Notify when a run finishes", isOn: $rule.notify)
            HStack { Spacer(); Button("Cancel") { dismiss() }
                Button("Save") { rule.patterns = patterns.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }; save(rule); dismiss() }.keyboardShortcut(.defaultAction) }
        }
        .padding().frame(width: 480)
        .onAppear { patterns = rule.patterns.joined(separator: ", ") }
    }
}

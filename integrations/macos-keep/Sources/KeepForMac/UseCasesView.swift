import AppKit
import KeepKit
import SwiftUI
import UniformTypeIdentifiers

struct UseCasesView: View {
    @EnvironmentObject var app: AppState
    @State private var search = ""
    @State private var group: CatalogGroup?
    @State private var targeted = false

    private var filtered: [Demo] {
        app.demos.filter { d in
            (group == nil || Catalog.group(for: d.id) == group) &&
            (search.isEmpty || d.id.localizedCaseInsensitiveContains(search) || d.title.localizedCaseInsensitiveContains(search) || d.description.localizedCaseInsensitiveContains(search))
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                TextField("Search use cases", text: $search).textFieldStyle(.roundedBorder).frame(maxWidth: 320)
                Picker("Group", selection: $group) {
                    Text("All").tag(CatalogGroup?.none)
                    ForEach(CatalogGroup.allCases, id: \.self) { Text($0.title).tag(CatalogGroup?.some($0)) }
                }.frame(maxWidth: 200)
                Spacer()
                Text("\(filtered.count) of \(app.demos.count)").foregroundStyle(.secondary)
            }.padding()
            Divider()
            ZStack {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 260), spacing: 12)], spacing: 12) {
                        ForEach(filtered) { d in UseCaseCard(demo: d) }
                    }.padding()
                }
                if targeted {
                    RoundedRectangle(cornerRadius: 12).strokeBorder(Color.accentColor, style: StrokeStyle(lineWidth: 3, dash: [8])).padding(8)
                        .overlay(Text("Drop a file: Keep suggests a use case").font(.title3).padding().background(.regularMaterial, in: Capsule()))
                }
            }
            .dropDestination(for: URL.self) { urls, _ in
                DropRouter.route(urls, app: app); return true
            } isTargeted: { targeted = $0 }
        }
        .navigationTitle("Use cases")
    }
}

struct UseCaseCard: View {
    let demo: Demo
    @EnvironmentObject var app: AppState
    @State private var targeted = false
    @State private var showHow = false

    var body: some View {
        let entry = Catalog.entry(for: demo.id)
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(demo.title).font(.headline).lineLimit(1)
                Spacer()
                Text(Catalog.group(for: demo.id).title).font(.caption2).padding(.horizontal, 6).padding(.vertical, 2).background(.quaternary, in: Capsule())
            }
            Text(demo.description).font(.callout).foregroundStyle(.secondary).lineLimit(3)
            HStack(spacing: 4) {
                ForEach(demo.accepts.prefix(4), id: \.self) { Text(".\($0)").font(.caption.monospaced()).padding(.horizontal, 5).background(.quaternary, in: RoundedRectangle(cornerRadius: 4)) }
            }
            Spacer(minLength: 0)
            HStack {
                Button("Choose file…") { pick() }.buttonStyle(.borderedProminent).controlSize(.small)
                if let how = entry?.howToGetFile {
                    Button("How to get the file") { showHow.toggle() }.controlSize(.small)
                        .popover(isPresented: $showHow) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Run this yourself, then choose the file. Keep never runs it for you.").font(.callout)
                                Text(how).font(.system(.callout, design: .monospaced)).textSelection(.enabled)
                                Button("Copy command") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(how, forType: .string) }
                            }.padding().frame(maxWidth: 420)
                        }
                }
            }
        }
        .padding(12).frame(height: 170)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(nsColor: .controlBackgroundColor)))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(targeted ? Color.accentColor : Color.gray.opacity(0.25), lineWidth: targeted ? 3 : 1))
        .dropDestination(for: URL.self) { urls, _ in
            let files = FileExpander.files(from: urls); guard !files.isEmpty else { return false }
            app.run(demo: demo.id, files: files); return true
        } isTargeted: { targeted = $0 }
    }

    private func pick() {
        let p = NSOpenPanel(); p.allowsMultipleSelection = true; p.canChooseDirectories = false
        if let types = Optional(demo.accepts.compactMap { UTType(filenameExtension: $0) }), !types.isEmpty { p.allowedContentTypes = types }
        if p.runModal() == .OK { app.run(demo: demo.id, files: p.urls) }
    }
}

enum FileExpander {
    /// Folders become their files (one level deep); hidden files are skipped.
    static func files(from urls: [URL]) -> [URL] {
        urls.flatMap { url -> [URL] in
            var isDir: ObjCBool = false
            guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir) else { return [] }
            if isDir.boolValue {
                let inner = (try? FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])) ?? []
                return inner.filter { var d: ObjCBool = false; return FileManager.default.fileExists(atPath: $0.path, isDirectory: &d) && !d.boolValue }
            }
            return [url]
        }
    }
}

enum DropRouter {
    /// Dropped files with no chosen use case: run the best suggestion, or ask when several fit a group of files.
    @MainActor static func route(_ urls: [URL], app: AppState) {
        let files = FileExpander.files(from: urls)
        guard let first = files.first else { return }
        let suggestions = Catalog.suggestions(forFileNamed: first.lastPathComponent, among: app.demos)
        guard let best = suggestions.first else { app.notice = "No use case reads .\(first.pathExtension) files. Pick a card and drop the file on it."; return }
        // Only files the suggested use case reads go with it.
        let ext = Set(best.accepts.map { $0.lowercased() })
        app.run(demo: best.id, files: files.filter { ext.contains($0.pathExtension.lowercased()) })
    }
}

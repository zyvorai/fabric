import AppIntents
import Foundation
import KeepKit

/// Lets Shortcuts and Siri run a Keep use case on a file. The intent only starts the run and returns the summary;
/// it has the same limits as the app (a file you pass, a sealed cell, no commands on your Mac).
struct RunUseCaseIntent: AppIntent {
    static var title: LocalizedStringResource = "Summarise a file with Keep"
    static var description = IntentDescription("Runs a Keep use case on a file in a sealed cell and returns the summary.")

    @Parameter(title: "Use case", description: "The use case id, for example pdf-brief or csv-clean.", default: "pdf-brief")
    var useCase: String

    @Parameter(title: "File")
    var file: IntentFile

    static var parameterSummary: some ParameterSummary { Summary("Summarise \(\.$file) with \(\.$useCase)") }

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let (client, demo) = try await MainActor.run { () -> (KeepClient, Demo?) in
            guard let c = AppState.shared.client else { throw IntentError.notConnected }
            return (c, AppState.shared.demo(useCase))
        }
        let name = file.filename.isEmpty ? "file" : file.filename
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("intent-\(UUID().uuidString)-\(name)")
        try file.data.write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        let outcome = try await client.run(demo: useCase, files: [url], maxBytes: demo?.maxBytes)
        guard let ref = outcome.items.first?.result?.artifacts.first(where: { $0.title.hasSuffix(".md") }) ?? outcome.items.first?.result?.artifacts.first else {
            throw IntentError.noResult(outcome.items.first?.error ?? "the run returned nothing")
        }
        return .result(value: try await client.artifact(id: ref.id).body)
    }
}

enum IntentError: Error, CustomLocalizedStringResourceConvertible {
    case notConnected, noResult(String)
    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .notConnected: return "Keep for Mac is not connected to a host. Open the app and add the host and token in Settings."
        case .noResult(let m): return "Keep returned no summary: \(m)"
        }
    }
}

struct KeepShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: RunUseCaseIntent(), phrases: ["Summarise a file with \(.applicationName)", "Run \(.applicationName) on a file"], shortTitle: "Summarise with Keep", systemImageName: "doc.text.magnifyingglass")
    }
}

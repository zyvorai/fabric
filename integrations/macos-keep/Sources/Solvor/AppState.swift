import AppKit
import Foundation
import KeepKit
import SwiftUI
import UserNotifications

/// One run the app is doing or has done in this session.
struct Job: Identifiable {
    enum State { case running, done(RunOutcome), failed(String) }
    let id = UUID()
    let demo: String
    let files: [URL]
    let started = Date()
    var state: State = .running
    var source: String = "manual"   // manual, folder rule, service, shortcut
}

@MainActor
final class AppState: ObservableObject {
    static let shared = AppState()

    // Connection
    @AppStorage("host") var host: String = ""
    @Published var connected = false
    @Published var status: KeepStatus?
    @Published var connectionError: String?
    @Published var usage: UsageReport?
    let tokens: TokenStore = KeychainTokenStore()
    @AppStorage("userId") var userId: String = ""

    // Data
    @Published var demos: [Demo] = []
    @Published var runs: [Artifact] = []
    @Published var approvals: [Approval] = []
    @Published var jobs: [Job] = []
    @Published var selectedJob: UUID?
    @Published var folderRules: [FolderRule] = [] { didSet { saveRules() } }
    @Published var notice: String?
    @Published var pane: Pane? = .useCases
    @Published var sheet: ActiveSheet?
    @Published var choice: ChoiceRequest?
    @AppStorage("welcomed") var welcomed = false
    @AppStorage("speechLanguage") var speechLanguage = ""   // empty = the Mac's language

    // Settings
    @AppStorage("notify") var notify = true
    @AppStorage("uploadWarnMB") var uploadWarnMB = 20
    @Published var pendingSecretWarning: PendingUpload?

    private var seen = SeenFiles()
    private var poller: Task<Void, Never>?
    let watcher = FolderWatcher()

    enum ActiveSheet: String, Identifiable { case email, voice, welcome, about; var id: String { rawValue } }

    /// A choice the person has to make before a run: which use case reads this file.
    struct ChoiceRequest: Identifiable { let id = UUID(); let title: String; let files: [URL]; let options: [Demo]; let source: String }

    struct PendingUpload: Identifiable { let id = UUID(); let demo: String; let files: [URL]; let findings: [String]; let source: String }

    init() {
        loadRules(); loadSeen()
        watcher.onFile = { [weak self] rule, file in Task { @MainActor in await self?.handleWatched(rule: rule, file: file) } }
    }

    // MARK: connection

    var client: KeepClient? {
        var hostString = host
        var token = try? tokens.token()
        #if DEBUG
        // Development only: a debug build may take the host and token from the environment instead of the Keychain.
        if let h = ProcessInfo.processInfo.environment["KEEP_DEV_HOST"], let t = ProcessInfo.processInfo.environment["KEEP_DEV_TOKEN"] { hostString = h; token = t }
        #endif
        guard let url = URL(string: hostString.trimmingCharacters(in: .whitespaces)), let token, !token.isEmpty else { return nil }
        return try? KeepClient(baseURL: url, token: token)
    }

    func saveConnection(host: String, token: String) async {
        self.host = host
        do { try tokens.save(token) } catch { connectionError = error.localizedDescription; return }
        await connect()
    }

    func connect() async {
        connectionError = nil
        guard let c = client else { connected = false; connectionError = "Enter the host address and a token."; return }
        do {
            status = try await c.status()
            demos = try await c.demos()
            connected = true
            await refreshRuns(); await refreshApprovals(); await refreshUsage()
            watcher.update(rules: folderRules)
            startPolling()
        } catch {
            connected = false; connectionError = error.localizedDescription
        }
    }

    func disconnect() {
        try? tokens.clear(); connected = false; status = nil; demos = []; runs = []; approvals = []; poller?.cancel(); watcher.update(rules: [])
    }

    // MARK: data

    func refreshRuns() async { if let c = client { runs = ((try? await c.artifacts(limit: 100)) ?? runs) } }
    func refreshUsage() async { if let c = client, !userId.isEmpty { usage = try? await c.usage(userId: userId) } }

    func refreshApprovals() async {
        guard let c = client else { return }
        if !userId.isEmpty, let inbox = try? await c.inbox(userId: userId) { approvals = inbox.pendingApprovals; return }
        approvals = ((try? await c.approvals()) ?? []).filter(\.isPending)
    }

    private func startPolling() {
        poller?.cancel()
        poller = Task { [weak self] in
            var known = Set<String>()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 20 * 1_000_000_000)
                guard let self else { return }
                await self.refreshApprovals()
                let fresh = self.approvals.filter { !known.contains($0.id) }
                for a in fresh { Notifier.post(title: "Approval needed", body: a.prompt ?? "\(a.kind) \(a.subject ?? "")") }
                known.formUnion(self.approvals.map(\.id))
            }
        }
    }

    // MARK: running use cases

    func demo(_ id: String) -> Demo? { demos.first { $0.id == id } }

    /// Starts a run, after the secret and size checks. Returns immediately; progress is in `jobs`.
    func run(demo: String, files: [URL], source: String = "manual", skipChecks: Bool = false) {
        guard client != nil else { notice = "Connect to a Keep host first."; return }
        if !skipChecks {
            var findings: [String] = []
            for f in files { for s in SecretScan.scan(fileURL: f) { findings.append("\(f.lastPathComponent): \(s.kind) (\(s.where_))") } }
            let big = files.filter { ((try? FileManager.default.attributesOfItem(atPath: $0.path)[.size] as? Int) ?? 0) > uploadWarnMB * 1_048_576 }
            findings += big.map { "\($0.lastPathComponent): larger than \(uploadWarnMB) MB" }
            if !findings.isEmpty { pendingSecretWarning = PendingUpload(demo: demo, files: files, findings: findings, source: source); return }
        }
        var job = Job(demo: demo, files: files); job.source = source
        jobs.insert(job, at: 0); selectedJob = job.id
        let id = job.id, limit = self.demo(demo)?.maxBytes
        Task { [weak self] in
            guard let self, let c = self.client else { return }
            do {
                let outcome = try await c.run(demo: demo, files: files, maxBytes: limit)
                self.finish(id, .done(outcome))
                await self.refreshRuns(); await self.refreshUsage()
            } catch { self.finish(id, .failed(error.localizedDescription)) }
        }
    }

    func confirmPending() { if let p = pendingSecretWarning { pendingSecretWarning = nil; run(demo: p.demo, files: p.files, source: p.source, skipChecks: true) } }

    private func finish(_ id: UUID, _ state: Job.State) {
        guard let i = jobs.firstIndex(where: { $0.id == id }) else { return }
        jobs[i].state = state
        if notify {
            switch state {
            case .done(let o): Notifier.post(title: "Keep: \(jobs[i].demo)", body: "\(o.items.filter(\.ok).count) of \(o.items.count) done, " + (o.isSimulated ? "simulated, not sealed" : "\(o.egressConnects) outbound connections"))
            case .failed(let m): Notifier.post(title: "Keep: run failed", body: m)
            case .running: break
            }
        }
    }

    // MARK: watched folders

    private var rulesURL: URL { Self.supportDir.appendingPathComponent("folder-rules.json") }
    private var seenURL: URL { Self.supportDir.appendingPathComponent("seen.json") }
    static var supportDir: URL {
        let d = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Solvor")
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true); return d
    }
    private func loadRules() { folderRules = (try? JSONDecoder().decode([FolderRule].self, from: Data(contentsOf: rulesURL))) ?? [] }
    private func saveRules() { try? JSONEncoder().encode(folderRules).write(to: rulesURL); watcher.update(rules: connected ? folderRules : []) }
    private func loadSeen() { seen = (try? JSONDecoder().decode(SeenFiles.self, from: Data(contentsOf: seenURL))) ?? SeenFiles() }
    private func saveSeen() { try? JSONEncoder().encode(seen).write(to: seenURL) }

    private func handleWatched(rule: FolderRule, file: URL) async {
        guard connected, let hash = try? ContentHash.sha256(of: file), !seen.contains(rule: rule.id, hash: hash) else { return }
        seen.insert(rule: rule.id, hash: hash); saveSeen()
        run(demo: rule.demo, files: [file], source: "folder rule", skipChecks: false)
        if rule.saveBesideFile, let c = client {
            // Wait for this run, then write the first summary next to the file.
            for _ in 0..<120 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard let job = jobs.first(where: { $0.files == [file] && $0.source == "folder rule" }) else { continue }
                if case .done(let o) = job.state, let ref = o.items.first?.result?.artifacts.first(where: { $0.title.hasSuffix(".md") }) ?? o.items.first?.result?.artifacts.first {
                    if let art = try? await c.artifact(id: ref.id) {
                        let out = file.deletingPathExtension().appendingPathExtension("keep.md")
                        try? art.body.write(to: out, atomically: true, encoding: .utf8)
                    }
                    return
                }
                if case .failed = job.state { return }
            }
        }
    }
}

@MainActor enum Notifier {
    static func post(title: String, body: String) {
        guard AppState.shared.notify else { return }
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            let c = UNMutableNotificationContent(); c.title = title; c.body = body
            center.add(UNNotificationRequest(identifier: UUID().uuidString, content: c, trigger: nil))
        }
    }
}


// MARK: voice and shortcuts

extension AppState {
    /// The newest regular, non-hidden file in Downloads (shown to the person before anything is sent).
    func latestDownload() -> URL? {
        let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey, .isRegularFileKey], options: [.skipsHiddenFiles])) ?? []
        return files.filter { (try? $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true && !$0.lastPathComponent.hasSuffix(".crdownload") && !$0.lastPathComponent.hasSuffix(".download") }
            .max { ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) < ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) }
    }

    /// Carries out a parsed voice or Siri command. Every path that uploads goes through the normal secret and size checks; nothing here approves anything.
    func perform(_ command: VoiceCommand) {
        NSApp.activate(ignoringOtherApps: true)
        switch command {
        case .readBrowserEmail: sheet = .email
        case .show(let screen): pane = Pane(screen); selectedJob = nil
        case .lastRun: pane = .runs; selectedJob = nil
        case .approvalNeedsTouchID: pane = .approvals; selectedJob = nil; notice = "Approving and denying is only done with Touch ID, never by voice. Your approvals are open."
        case .unknown(let t): notice = "I did not understand \"\(t)\"."
        case .summarise(let target, let useCase):
            var file: URL?
            switch target {
            case .latestDownload:
                file = latestDownload()
                if file == nil { notice = "There is nothing in your Downloads folder to read."; return }
            case .clipboard:
                guard let text = NSPasteboard.general.string(forType: .string), !text.isEmpty else { notice = "The clipboard has no text."; return }
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("clipboard.txt")
                do { try text.write(to: url, atomically: true, encoding: .utf8) } catch { notice = error.localizedDescription; return }
                file = url
            }
            guard let f = file else { return }
            if let useCase, demo(useCase) != nil { run(demo: useCase, files: [f], source: "voice"); return }
            let options = Catalog.suggestions(forFileNamed: f.lastPathComponent, among: demos)
            switch options.count {
            case 0: notice = "No use case reads \(f.lastPathComponent)."
            case 1: run(demo: options[0].id, files: [f], source: "voice")
            default: choice = ChoiceRequest(title: "Which use case should read \(f.lastPathComponent)?", files: [f], options: Array(options.prefix(6)), source: "voice")
            }
        }
    }
}

enum Pane: String, CaseIterable, Identifiable {
    case useCases = "Use cases", runs = "Runs", approvals = "Approvals", folders = "Watch folders", settings = "Settings"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .useCases: return "square.grid.2x2.fill"
        case .runs: return "clock.arrow.circlepath"
        case .approvals: return "checkmark.seal.fill"
        case .folders: return "folder.badge.gearshape"
        case .settings: return "gearshape.fill"
        }
    }
    init(_ screen: AppScreen) {
        switch screen {
        case .useCases: self = .useCases
        case .runs: self = .runs
        case .approvals: self = .approvals
        case .watchFolders: self = .folders
        case .settings: self = .settings
        }
    }
}

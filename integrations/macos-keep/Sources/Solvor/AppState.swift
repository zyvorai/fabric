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

    // Connection. The host and the user id live in `defaults`, so a test can use a scratch suite instead of the app's own.
    let defaults: UserDefaults
    var host: String {
        get { defaults.string(forKey: "host") ?? "" }
        set { objectWillChange.send(); defaults.set(newValue, forKey: "host") }
    }
    var userId: String {
        get { defaults.string(forKey: "userId") ?? "" }
        set { objectWillChange.send(); defaults.set(newValue, forKey: "userId") }
    }
    @Published var connected = false
    @Published var status: KeepStatus?
    @Published var problem: ConnectionProblem?
    var connectionError: String? { problem.map { "\($0.title). \($0.hint)" } }
    /// A `keep://connect` link waiting for the person's yes; nothing is contacted or stored until they give it.
    @Published var pendingLink: ConnectionLink?
    @Published var usage: UsageReport?
    let tokens: TokenStore

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
    let supportDir: URL
    private let makeClient: (URL, String) throws -> any KeepAPI
    /// Approvals the person has already been told about. It outlives a reconnect, so reconnecting does not notify again.
    private(set) var announcedApprovals = Set<String>()
    var notifier: @MainActor (String, String) -> Void = { Notifier.post(title: $0, body: $1) }
    var pollInterval: UInt64 = 20

    enum ActiveSheet: String, Identifiable { case email, voice, welcome, about; var id: String { rawValue } }

    /// A choice the person has to make before a run: which use case reads this file.
    struct ChoiceRequest: Identifiable { let id = UUID(); let title: String; let files: [URL]; let options: [Demo]; let source: String }

    struct PendingUpload: Identifiable { let id = UUID(); let demo: String; let files: [URL]; let findings: [String]; let source: String }

    init(defaults: UserDefaults = .standard, tokens: TokenStore = KeychainTokenStore(), supportDir: URL = AppState.defaultSupportDir,
         makeClient: @escaping (URL, String) throws -> any KeepAPI = { try KeepClient(baseURL: $0, token: $1) }) {
        self.defaults = defaults; self.tokens = tokens; self.supportDir = supportDir; self.makeClient = makeClient
        loadRules(); loadSeen()
        watcher.onFile = { [weak self] rule, file in Task { @MainActor in await self?.handleWatched(rule: rule, file: file) } }
    }

    // MARK: connection

    private var credentials: (URL, String)? {
        var hostString = host
        var token = try? tokens.token()
        #if DEBUG
        // Development only: a debug build may take the host and token from the environment instead of the Keychain.
        if let h = ProcessInfo.processInfo.environment["KEEP_DEV_HOST"], let t = ProcessInfo.processInfo.environment["KEEP_DEV_TOKEN"] { hostString = h; token = t }
        #endif
        guard let url = URL(string: hostString.trimmingCharacters(in: .whitespaces)), let token, !token.isEmpty else { return nil }
        return (url, token)
    }

    /// The host as the app state itself talks to it (a test supplies a stub through `makeClient`).
    var api: (any KeepAPI)? { credentials.flatMap { try? makeClient($0.0, $0.1) } }

    /// The concrete client the views use for chat, goals, memory and decisions.
    var client: KeepClient? { credentials.flatMap { try? KeepClient(baseURL: $0.0, token: $0.1) } }

    func saveConnection(host: String, token: String) async {
        self.host = host
        do { try tokens.save(token) } catch { problem = ConnectionProblem(error); return }
        await connect()
    }

    func connect() async {
        problem = nil
        guard credentials != nil else {
            connected = false
            problem = URL(string: host.trimmingCharacters(in: .whitespaces)) == nil && !host.isEmpty ? ConnectionProblem(KeepError.badURL) : .missing
            return
        }
        guard let c = api else { connected = false; problem = ConnectionProblem(KeepError.badURL); return }
        do {
            // The list of use cases is what proves the host and the token work (any user token may read it). Two things are optional:
            // /v1/keep/status is an operator route (a user token gets a 403), and whoami only tells us who the token belongs to.
            status = try? await c.status()
            if let me = try? await c.whoami(), let id = me.userId, !id.isEmpty { userId = id }
            demos = try await c.demos()
            connected = true
            await refreshRuns(); await refreshApprovals(); await refreshUsage()
            // Whatever is already waiting is on the screen the person opens; only what arrives later is announced.
            announcedApprovals.formUnion(approvals.map(\.id))
            watcher.update(rules: folderRules)
            startPolling()
        } catch {
            connected = false; problem = ConnectionProblem(error)
        }
    }

    /// A `keep://connect` link opened from outside is never acted on by itself.
    func offer(link: ConnectionLink) { pendingLink = link }
    func acceptPendingLink() async {
        guard let l = pendingLink else { return }
        pendingLink = nil
        await saveConnection(host: l.host.absoluteString, token: l.token)
    }

    func disconnect() {
        try? tokens.clear(); connected = false; status = nil; demos = []; runs = []; approvals = []; poller?.cancel(); watcher.update(rules: [])
        announcedApprovals = []
    }

    // MARK: data

    func refreshRuns() async { if let c = api { runs = ((try? await c.artifacts(limit: 100)) ?? runs) } }
    func refreshUsage() async { if let c = api, !userId.isEmpty { usage = try? await c.usage(userId: userId) } }

    func refreshApprovals() async {
        guard let c = api else { return }
        if !userId.isEmpty, let inbox = try? await c.inbox(userId: userId) { approvals = inbox.pendingApprovals; return }
        approvals = ((try? await c.approvals()) ?? []).filter(\.isPending)
    }

    /// One poll: refresh, then tell the person about approvals they have not been told about yet.
    func pollApprovals() async {
        await refreshApprovals()
        for a in approvals where !announcedApprovals.contains(a.id) {
            announcedApprovals.insert(a.id)
            if notify { notifier("Approval needed", a.prompt ?? "\(a.kind) \(a.subject ?? "")") }
        }
    }

    private func startPolling() {
        poller?.cancel()
        poller = Task { [weak self] in
            while !Task.isCancelled {
                guard let interval = self?.pollInterval else { return }
                try? await Task.sleep(nanoseconds: interval * 1_000_000_000)
                guard let self, !Task.isCancelled else { return }
                await self.pollApprovals()
            }
        }
    }

    // MARK: running use cases

    func demo(_ id: String) -> Demo? { demos.first { $0.id == id } }

    /// Starts a run, after the secret and size checks. Returns immediately; progress is in `jobs`.
    func run(demo: String, files: [URL], source: String = "manual", skipChecks: Bool = false) {
        guard api != nil else { notice = "Connect to a Keep host first."; return }
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
            guard let self, let c = self.api else { return }
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
            case .done(let o): notifier("Keep: \(jobs[i].demo)", "\(o.items.filter(\.ok).count) of \(o.items.count) done, " + (o.isSimulated ? "simulated, not sealed" : "\(o.egressConnects) outbound connections"))
            case .failed(let m): notifier("Keep: run failed", m)
            case .running: break
            }
        }
    }
    // MARK: watched folders

    private var rulesURL: URL { supportDir.appendingPathComponent("folder-rules.json") }
    private var seenURL: URL { supportDir.appendingPathComponent("seen.json") }
    nonisolated static var defaultSupportDir: URL {
        let d = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Solvor")
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true); return d
    }
    private func loadRules() { folderRules = (try? JSONDecoder().decode([FolderRule].self, from: Data(contentsOf: rulesURL))) ?? [] }
    private func saveRules() { try? FileManager.default.createDirectory(at: supportDir, withIntermediateDirectories: true); try? JSONEncoder().encode(folderRules).write(to: rulesURL); watcher.update(rules: connected ? folderRules : []) }
    private func loadSeen() { seen = (try? JSONDecoder().decode(SeenFiles.self, from: Data(contentsOf: seenURL))) ?? SeenFiles() }
    private func saveSeen() { try? FileManager.default.createDirectory(at: supportDir, withIntermediateDirectories: true); try? JSONEncoder().encode(seen).write(to: seenURL) }

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
    case useCases = "Use cases", runs = "Runs", approvals = "Approvals", goals = "Goals", memory = "Memory", done = "Done", folders = "Watch folders", settings = "Settings"
    var id: String { rawValue }
    var icon: String {
        switch self {
        case .useCases: return "square.grid.2x2.fill"
        case .runs: return "clock.arrow.circlepath"
        case .approvals: return "checkmark.seal.fill"
        case .goals: return "checklist"
        case .memory: return "brain.head.profile"
        case .done: return "checkmark.circle"
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

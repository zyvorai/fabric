import KeepKit
import XCTest
@testable import Solvor

private final class MemoryTokens: TokenStore, @unchecked Sendable {
    var value: String?
    func token() throws -> String? { value }
    func save(_ token: String) throws { value = token }
    func clear() throws { value = nil }
}

/// A host that answers from properties, so the state machine can be tested without a network.
private final class StubHost: KeepAPI, @unchecked Sendable {
    var whoamiResult: Result<WhoAmI, Error> = .success(WhoAmI(role: "user", userId: "ana", scopes: ["read"]))
    var statusResult: Result<KeepStatus, Error> = .failure(KeepError.http(status: 403, message: "this route is not available to user tokens"))
    var demosResult: Result<[Demo], Error> = .success([])
    var pending: [Approval] = []

    func whoami() async throws -> WhoAmI { try whoamiResult.get() }
    func status() async throws -> KeepStatus { try statusResult.get() }
    func demos() async throws -> [Demo] { try demosResult.get() }
    func artifacts(limit: Int?) async throws -> [Artifact] { [] }
    func artifact(id: String) async throws -> Artifact { throw KeepError.http(status: 404, message: "none") }
    func inbox(userId: String?) async throws -> Inbox {
        let ids = pending.map { #"{"id":"\#($0.id)","kind":"\#($0.kind)","status":"pending"}"# }.joined(separator: ",")
        return try JSONDecoder.keep.decode(Inbox.self, from: Data(#"{"user_id":"\#(userId ?? "")","pending_approvals":[\#(ids)]}"#.utf8))
    }
    func approvals() async throws -> [Approval] { pending }
    func usage(userId: String?) async throws -> UsageReport { throw KeepError.http(status: 404, message: "none") }
    func run(demo: String, files: [URL], maxBytes: Int?) async throws -> RunOutcome { throw KeepError.http(status: 500, message: "not in this test") }
}

private func approval(_ id: String) -> Approval {
    try! JSONDecoder.keep.decode(Approval.self, from: Data(#"{"id":"\#(id)","kind":"gmail.send","subject":"Hi","status":"pending"}"#.utf8))
}
private func demo(_ id: String) -> Demo {
    try! JSONDecoder.keep.decode(Demo.self, from: Data(#"{"id":"\#(id)","title":"T","description":"d","accepts":[],"builtin":true}"#.utf8))
}

@MainActor
final class AppStateTests: XCTestCase {
    private var host = StubHost()
    private var tokens = MemoryTokens()
    private var built = 0
    private var told: [String] = []

    private func makeApp(host h: String = "http://127.0.0.1:9096", token: String? = "kut1abc") -> AppState {
        host = StubHost(); tokens = MemoryTokens(); tokens.value = token; built = 0; told = []
        let suite = "solvor-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("solvor-test-\(UUID().uuidString)")
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        let app = AppState(defaults: defaults, tokens: tokens, supportDir: dir, makeClient: { [unowned self] _, _ in built += 1; return host })
        app.host = h
        app.notifier = { [unowned self] title, body in told.append("\(title): \(body)") }
        return app
    }

    func testAUserTokenConnectsEvenThoughStatusIsOperatorOnlyAndTheUserIdComesFromWhoami() async {
        let app = makeApp()
        host.demosResult = .success([demo("csv-clean")])
        await app.connect()
        XCTAssertTrue(app.connected); XCTAssertNil(app.problem)
        XCTAssertEqual(app.userId, "ana", "the user id is read from whoami, not typed")
        XCTAssertEqual(app.demos.map(\.id), ["csv-clean"])
        XCTAssertNil(app.status)
    }

    func testAnOperatorTokenKeepsTheUserIdThePersonTyped() async {
        let app = makeApp(); app.userId = "bo"
        host.whoamiResult = .success(WhoAmI(role: "operator"))
        await app.connect()
        XCTAssertTrue(app.connected); XCTAssertEqual(app.userId, "bo")
    }

    func testEachFailureIsClassifiedAndLeavesTheAppDisconnected() async {
        let app = makeApp()
        host.demosResult = .failure(KeepError.unauthorized)
        await app.connect()
        XCTAssertFalse(app.connected); XCTAssertEqual(app.problem?.kind, .refusedToken)
        host.demosResult = .failure(KeepError.transport("The Internet connection appears to be offline."))
        await app.connect()
        XCTAssertEqual(app.problem?.kind, .offline)
        host.demosResult = .success([])
        await app.connect()
        XCTAssertTrue(app.connected); XCTAssertNil(app.problem, "a retry clears the problem")
    }

    func testMissingDetailsSayWhatToAdd() async {
        let noToken = makeApp(token: nil)
        await noToken.connect()
        XCTAssertEqual(noToken.problem?.kind, .missing); XCTAssertEqual(built, 0, "nothing is contacted without a token")
        let noHost = makeApp(host: "")
        await noHost.connect()
        XCTAssertEqual(noHost.problem?.kind, .missing)
    }

    func testOnlyApprovalsThatArriveAfterConnectingAreAnnouncedAndNotAgainAfterAReconnect() async {
        let app = makeApp()
        host.pending = [approval("a1")]
        await app.connect()
        await app.pollApprovals()
        XCTAssertEqual(told, [], "what was already waiting is on screen when the person opens the app")
        host.pending = [approval("a1"), approval("a2")]
        await app.pollApprovals()
        XCTAssertEqual(told.count, 1); XCTAssertTrue(told[0].hasPrefix("Approval needed"))
        await app.pollApprovals()
        XCTAssertEqual(told.count, 1, "the same approval is not announced twice")
        await app.connect()
        await app.pollApprovals()
        XCTAssertEqual(told.count, 1, "reconnecting does not announce it again")
        host.pending.append(approval("a3"))
        await app.pollApprovals()
        XCTAssertEqual(told.count, 2)
    }

    func testTurningNotificationsOffSilencesThem() async {
        let app = makeApp(); app.notify = false
        await app.connect()
        host.pending = [approval("a1")]
        await app.pollApprovals()
        XCTAssertEqual(told, [])
        app.notify = true
    }

    func testALinkFromOutsideNeedsTheirYesBeforeAnythingIsStoredOrContacted() async {
        let app = makeApp(host: "", token: nil)
        let link = ConnectionLink("keep://connect?host=http://127.0.0.1:19096&token=kut1new")!
        app.offer(link: link)
        XCTAssertEqual(app.pendingLink, link)
        XCTAssertNil(tokens.value); XCTAssertEqual(built, 0); XCTAssertFalse(app.connected)
        await app.acceptPendingLink()
        XCTAssertEqual(tokens.value, "kut1new"); XCTAssertEqual(app.host, "http://127.0.0.1:19096")
        XCTAssertTrue(app.connected); XCTAssertNil(app.pendingLink)
    }

    func testDisconnectForgetsTheTokenAndWhatWasAnnounced() async {
        let app = makeApp()
        host.pending = [approval("a1")]
        await app.connect()
        XCTAssertFalse(app.announcedApprovals.isEmpty)
        app.disconnect()
        XCTAssertNil(tokens.value); XCTAssertFalse(app.connected); XCTAssertTrue(app.announcedApprovals.isEmpty)
    }

    func testConnectionModelFillsFromAPastedLinkOrToken() {
        let m = ConnectionModel()
        XCTAssertFalse(m.canConnect)
        XCTAssertTrue(m.paste("keep://connect?host=http://keep.example.com&token=kut1zzzz"))
        XCTAssertEqual(m.hostText, "http://keep.example.com"); XCTAssertEqual(m.tokenText, "kut1zzzz")
        XCTAssertNotNil(m.warning, "plain http to another machine is flagged"); XCTAssertTrue(m.canConnect)
        XCTAssertTrue(m.paste("kut1othertoken")); XCTAssertEqual(m.tokenText, "kut1othertoken"); XCTAssertNil(m.warning)
        XCTAssertFalse(m.paste("hello there")); XCTAssertFalse(m.paste("")); XCTAssertFalse(m.paste("https://example.com"))
        XCTAssertEqual(m.tokenText, "kut1othertoken", "text that is neither a link nor a token changes nothing")
    }
}

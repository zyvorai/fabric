import XCTest
@testable import KeepKit

final class ConnectionTests: XCTestCase {
    func testWhoamiDecodesAUserAndAnOperator() async throws {
        let session = StubProtocol.session()
        StubProtocol.handler = { req, _ in
            XCTAssertEqual(req.url?.path, "/v1/whoami")
            XCTAssertEqual(req.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
            return (200, Data(#"{"role":"user","user_id":"ana","scopes":["read","chat"]}"#.utf8))
        }
        let c = try KeepClient(baseURL: URL(string: "http://h:1")!, token: "tok", session: session)
        let w = try await c.whoami()
        XCTAssertEqual(w, WhoAmI(role: "user", userId: "ana", scopes: ["read", "chat"]))
        XCTAssertFalse(w.isOperator)
        StubProtocol.handler = { _, _ in (200, Data(#"{"role":"operator"}"#.utf8)) }
        let o = try await c.whoami()
        XCTAssertTrue(o.isOperator); XCTAssertNil(o.userId)
    }

    func testAConnectionLinkNeedsAHostAndAToken() {
        let l = ConnectionLink("keep://connect?host=http%3A%2F%2F127.0.0.1%3A19096&token=kut1abc")
        XCTAssertEqual(l?.host.absoluteString, "http://127.0.0.1:19096"); XCTAssertEqual(l?.token, "kut1abc")
        XCTAssertEqual(l?.isLocal, true); XCTAssertEqual(l?.isPlainRemote, false)
        XCTAssertEqual(ConnectionLink("  keep://connect?host=https://keep.example.com&token=t \n")?.isPlainRemote, false)
        XCTAssertEqual(ConnectionLink("keep://connect?host=http://keep.example.com&token=t")?.isPlainRemote, true, "a token over plain http to another machine is flagged")
        for bad in ["keep://connect?host=http://h", "keep://connect?token=t", "keep://run?host=http://h&token=t", "http://h/?token=t",
                    "keep://connect?host=file:///etc&token=t", "keep://connect?host=notaurl&token=t", "keep://connect?host=http://h&token=", "nonsense"] {
            XCTAssertNil(ConnectionLink(bad), bad)
        }
    }

    func testProbingKeepsOnlyAHostThatAnswersOkAndKeepsPortOrder() async {
        let session = StubProtocol.session()
        StubProtocol.handler = { req, _ in
            switch req.url?.port {
            case 19096: return (200, Data(#"{"ok":true}"#.utf8))
            case 9096: return (200, Data(#"{"ok":true}"#.utf8))
            default: return (200, Data(#"{"hello":1}"#.utf8))
            }
        }
        let both = await HostProbe.local(ports: [9096, 19096, 1234], session: session)
        XCTAssertEqual(both.map(\.absoluteString), ["http://127.0.0.1:9096", "http://127.0.0.1:19096"])
        StubProtocol.handler = { _, _ in (503, Data("no".utf8)) }
        let none = await HostProbe.local(session: session)
        XCTAssertTrue(none.isEmpty)
    }

    func testEachFailureGetsItsOwnWords() {
        XCTAssertEqual(ConnectionProblem(KeepError.badURL).kind, .badAddress)
        XCTAssertEqual(ConnectionProblem(KeepError.unauthorized).kind, .refusedToken)
        XCTAssertEqual(ConnectionProblem(KeepError.transport("offline")).kind, .offline)
        XCTAssertEqual(ConnectionProblem(KeepError.http(status: 403, message: "x")).kind, .forbidden)
        XCTAssertEqual(ConnectionProblem(KeepError.decoding("x")).kind, .notKeep)
        XCTAssertEqual(ConnectionProblem(KeepError.http(status: 500, message: "boom")).hint, "boom")
        XCTAssertTrue(ConnectionProblem(KeepError.transport("timed out")).hint.contains("timed out"))
        XCTAssertEqual(ConnectionProblem(CocoaError(.fileNoSuchFile)).kind, .other)
    }
}

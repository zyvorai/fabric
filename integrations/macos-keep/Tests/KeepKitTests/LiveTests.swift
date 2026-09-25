import XCTest
@testable import KeepKit

/// Runs against a real Keep host. Skipped unless KEEP_API and KEEP_TOKEN are set (for example through an SSH tunnel).
final class LiveTests: XCTestCase {
    func liveClient() throws -> KeepClient {
        let env = ProcessInfo.processInfo.environment
        guard let api = env["KEEP_API"], let token = env["KEEP_TOKEN"], let url = URL(string: api) else { throw XCTSkip("KEEP_API / KEEP_TOKEN not set") }
        return try KeepClient(baseURL: url, token: token)
    }

    func testStatusAndTheUseCaseList() async throws {
        let c = try liveClient()
        let status = try await c.status()
        XCTAssertEqual(status.fluxvm?.ready, true)
        let demos = try await c.demos()
        XCTAssertTrue(demos.contains { $0.id == "csv-clean" })
    }

    func testRunACsvInARealCellAndReadTheArtifact() async throws {
        let c = try liveClient()
        let file = try Fixture.tempFile("live.csv", "name,qty\nAnn,1\nBob,2\n")
        let out = try await c.run(demo: "csv-clean", files: [file])
        XCTAssertEqual(out.egressConnects, 0, "a use-case cell makes no outbound connection")
        let ref = try XCTUnwrap(out.items.first?.result?.artifacts.first)
        let artifact = try await c.artifact(id: ref.id)
        XCTAssertFalse(artifact.body.isEmpty)
    }

    func testABatchRunsOneCellPerFile() async throws {
        let c = try liveClient()
        let a = try Fixture.tempFile("one.csv", "a,b\n1,2\n"), b = try Fixture.tempFile("two.csv", "a,b\n3,4\n")
        let out = try await c.run(demo: "csv-clean", files: [a, b])
        guard case .batch(let batch) = out else { return XCTFail("expected a batch") }
        XCTAssertEqual(batch.ok, 2)
        XCTAssertEqual(batch.egressConnects, 0)
    }

    func testTheRunAppearsInHistoryAndTwoRunsCanBeCompared() async throws {
        let c = try liveClient()
        let items = try await c.artifacts(limit: 5)
        XCTAssertFalse(items.isEmpty)
        if items.count >= 2 {
            let text = try await c.diff(items[1].id, items[0].id)
            XCTAssertFalse(text.isEmpty)
        }
    }
}

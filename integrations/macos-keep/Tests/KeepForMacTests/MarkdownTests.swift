import XCTest
@testable import KeepForMac

final class MarkdownTests: XCTestCase {
    func testTheSummaryShapeParsesIntoBlocks() {
        let md = "# deck.md\n\nSummary of `x`.\n\n## Amounts\n- 1× 50,000 EUR\n- (no matches)\n\n## Size\n| Measure | Value |\n|---|---|\n| Lines | 9 |\n"
        let blocks = MarkdownView.parse(md)
        XCTAssertEqual(blocks.count, 7)
        guard case .heading(let l, _) = blocks[0] else { return XCTFail("heading") }
        XCTAssertEqual(l, 1)
        guard case .table(let header, let rows) = blocks[6] else { return XCTFail("table: \(blocks[6])") }
        XCTAssertEqual(header, ["Measure", "Value"])
        XCTAssertEqual(rows, [["Lines", "9"]])
    }
}

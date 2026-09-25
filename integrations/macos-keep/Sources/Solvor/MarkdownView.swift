import SwiftUI

/// A small Markdown renderer for Keep summaries: headings, bullets, tables, code fences and inline styling.
/// `AttributedString` reads inline Markdown but not blocks or tables, so blocks are parsed here.
struct MarkdownView: View {
    let markdown: String

    enum Block: Identifiable {
        case heading(Int, String), bullet(String), paragraph(String), code(String)
        case table(header: [String], rows: [[String]])
        var id: String {
            switch self {
            case .heading(let l, let t): return "h\(l)\(t)"
            case .bullet(let t): return "b\(t)"
            case .paragraph(let t): return "p\(t)"
            case .code(let t): return "c\(t)"
            case .table(let h, let r): return "t\(h)\(r.count)"
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(Self.parse(markdown).enumerated()), id: \.offset) { _, block in
                switch block {
                case .heading(let level, let text):
                    Text(inline(text)).font(level <= 1 ? .title2.bold() : level == 2 ? .headline : .subheadline.bold()).padding(.top, level <= 2 ? 6 : 0)
                case .bullet(let text):
                    HStack(alignment: .firstTextBaseline, spacing: 6) { Text("•"); Text(inline(text)).textSelection(.enabled) }
                case .paragraph(let text):
                    Text(inline(text)).textSelection(.enabled)
                case .code(let text):
                    Text(text).font(.system(.body, design: .monospaced)).padding(8).frame(maxWidth: .infinity, alignment: .leading)
                        .background(.quaternary, in: RoundedRectangle(cornerRadius: 6)).textSelection(.enabled)
                case .table(let header, let rows):
                    Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 4) {
                        GridRow { ForEach(Array(header.enumerated()), id: \.offset) { _, h in Text(inline(h)).bold() } }
                        Divider()
                        ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                            GridRow { ForEach(Array(r.enumerated()), id: \.offset) { _, c in Text(inline(c)).textSelection(.enabled) } }
                        }
                    }
                    .padding(8).background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 6))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func inline(_ s: String) -> AttributedString {
        (try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(s)
    }

    static func parse(_ text: String) -> [Block] {
        var blocks: [Block] = []
        var lines = text.components(separatedBy: "\n")[...]
        var paragraph: [String] = []
        func flush() { if !paragraph.isEmpty { blocks.append(.paragraph(paragraph.joined(separator: " "))); paragraph = [] } }
        func cells(_ line: String) -> [String] {
            var t = line.trimmingCharacters(in: .whitespaces)
            if t.hasPrefix("|") { t.removeFirst() }
            if t.hasSuffix("|") { t.removeLast() }
            return t.split(separator: "|", omittingEmptySubsequences: false).map { $0.trimmingCharacters(in: .whitespaces) }
        }
        while let line = lines.popFirst() {
            let t = line.trimmingCharacters(in: .whitespaces)
            if t.isEmpty { flush(); continue }
            if t.hasPrefix("```") {
                flush(); var code: [String] = []
                while let l = lines.popFirst(), !l.trimmingCharacters(in: .whitespaces).hasPrefix("```") { code.append(l) }
                blocks.append(.code(code.joined(separator: "\n"))); continue
            }
            if let m = t.range(of: #"^#{1,4} "#, options: .regularExpression) {
                flush(); blocks.append(.heading(t[m].count - 1, String(t[m.upperBound...]))); continue
            }
            if t.hasPrefix("|"), let next = lines.first, next.trimmingCharacters(in: .whitespaces).hasPrefix("|"), next.contains("---") {
                flush(); _ = lines.popFirst()
                var rows: [[String]] = []
                while let r = lines.first, r.trimmingCharacters(in: .whitespaces).hasPrefix("|") { rows.append(cells(r)); _ = lines.popFirst() }
                blocks.append(.table(header: cells(t), rows: rows)); continue
            }
            if t.hasPrefix("- ") || t.hasPrefix("* ") { flush(); blocks.append(.bullet(String(t.dropFirst(2)))); continue }
            paragraph.append(t)
        }
        flush()
        return blocks
    }
}

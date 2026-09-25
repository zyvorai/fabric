import KeepKit
import SwiftUI

/// Zyvor's brand: the orange gradient and the Z. Values come from zyvor.dev (`--hs-accent-fill #ff5a15`, `--hs-accent #cc420a`, ink `#14161a`).
enum Brand {
    static let orange = Color(red: 1.0, green: 0.353, blue: 0.082)
    static let deep = Color(red: 0.8, green: 0.259, blue: 0.039)
    static let glow = Color(red: 1.0, green: 0.478, blue: 0.239)
    static let ink = Color(red: 0.078, green: 0.086, blue: 0.102)
    static let good = Color(red: 0.19, green: 0.78, blue: 0.45)

    static var gradient: LinearGradient { LinearGradient(colors: [glow, orange, deep], startPoint: .topLeading, endPoint: .bottomTrailing) }

    static func color(_ g: CatalogGroup) -> Color {
        switch g {
        case .documents: return Color(red: 0.36, green: 0.55, blue: 1.0)
        case .phone: return Color(red: 0.24, green: 0.78, blue: 0.62)
        case .mac: return Color(red: 0.62, green: 0.45, blue: 0.95)
        case .windows: return Color(red: 0.2, green: 0.62, blue: 0.95)
        case .developer: return Color(red: 0.95, green: 0.55, blue: 0.2)
        case .browser: return Color(red: 0.95, green: 0.4, blue: 0.55)
        case .office: return Color(red: 0.85, green: 0.7, blue: 0.2)
        case .other: return Color.gray
        }
    }

    static func symbol(_ g: CatalogGroup) -> String {
        switch g {
        case .documents: return "doc.text"
        case .phone: return "iphone"
        case .mac: return "macbook"
        case .windows: return "pc"
        case .developer: return "chevron.left.forwardslash.chevron.right"
        case .browser: return "safari"
        case .office: return "briefcase"
        case .other: return "square.grid.2x2"
        }
    }
}

/// The Zyvor Z (the path from the Zyvor favicon), scaled into any rect. Stroke it with round caps.
struct ZMark: Shape {
    func path(in rect: CGRect) -> Path {
        // Favicon coordinates (64-unit box): 18.5,20.5 → 45.5,20.5 → 18.5,43.5 → 45.5,43.5. The Z occupies 27 x 23 units.
        let pts: [(CGFloat, CGFloat)] = [(18.5, 20.5), (45.5, 20.5), (18.5, 43.5), (45.5, 43.5)]
        let w = rect.width, h = rect.height
        let s = min(w, h) / 27
        let ox = rect.midX - 13.5 * s, oy = rect.midY - 11.5 * s
        var p = Path()
        for (i, pt) in pts.enumerated() {
            let q = CGPoint(x: ox + (pt.0 - 18.5) * s, y: oy + (pt.1 - 20.5) * s)
            if i == 0 { p.move(to: q) } else { p.addLine(to: q) }
        }
        return p
    }
}

/// The app mark: the orange squircle with the white Z.
struct LogoTile: View {
    var size: CGFloat = 40
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.23, style: .continuous).fill(Brand.gradient)
            RoundedRectangle(cornerRadius: size * 0.23, style: .continuous).strokeBorder(.white.opacity(0.25), lineWidth: 1)
            ZMark().stroke(.white, style: StrokeStyle(lineWidth: size * 0.13, lineCap: .round, lineJoin: .round)).padding(size * 0.26)
        }
        .frame(width: size, height: size)
        .shadow(color: Brand.deep.opacity(0.35), radius: size * 0.12, y: size * 0.06)
    }
}

struct Card: ViewModifier {
    var hover = false
    func body(content: Content) -> some View {
        if #available(macOS 26.0, *) {
            content
                .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.accentColor.opacity(hover ? 0.7 : 0), lineWidth: 1.5))
                .scaleEffect(hover ? 1.01 : 1)
                .animation(.spring(response: 0.3, dampingFraction: 0.75), value: hover)
        } else {
            content
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.background.opacity(0.9)))
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(.quaternary.opacity(0.35)))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(hover ? Color.accentColor.opacity(0.7) : Color.primary.opacity(0.08), lineWidth: hover ? 1.5 : 1))
                .shadow(color: .black.opacity(hover ? 0.18 : 0.06), radius: hover ? 12 : 4, y: hover ? 6 : 2)
                .scaleEffect(hover ? 1.012 : 1)
                .animation(.spring(response: 0.3, dampingFraction: 0.75), value: hover)
        }
    }
}
extension View { func card(hover: Bool = false) -> some View { modifier(Card(hover: hover)) } }

struct ProofPill: View {
    let egress: Int
    var evidence: String?
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: egress == 0 ? "lock.shield.fill" : "exclamationmark.shield.fill")
            Text(egress == 0 ? "0 outbound connections" : "\(egress) outbound connections").fontWeight(.semibold)
            if let evidence { Text("· \(evidence)").opacity(0.75) }
        }
        .font(.callout).padding(.horizontal, 12).padding(.vertical, 6)
        .foregroundStyle(egress == 0 ? Brand.good : .red)
        .background((egress == 0 ? Brand.good : Color.red).opacity(0.14), in: Capsule())
        .help("The cell that read your file had no network. The count is what it tried to reach; the host's operator can still read a cell's memory (evidence class software-test).")
    }
}

/// The running animation: rings close around the file inside the sealed cell. Still when Reduce Motion is on.
struct SealedCellView: View {
    var fileName: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { ctx in
            let t = reduceMotion ? 0 : ctx.date.timeIntervalSinceReferenceDate
            ZStack {
                ForEach(0..<3, id: \.self) { i in
                    let phase = (t * 0.6 + Double(i) / 3).truncatingRemainder(dividingBy: 1)
                    RoundedRectangle(cornerRadius: 40 - phase * 12, style: .continuous)
                        .strokeBorder(Brand.orange.opacity(1 - phase), lineWidth: 3)
                        .frame(width: 200 - phase * 60, height: 200 - phase * 60)
                }
                RoundedRectangle(cornerRadius: 30, style: .continuous).strokeBorder(Brand.orange.opacity(0.9), lineWidth: 4).frame(width: 130, height: 130)
                    .background(RoundedRectangle(cornerRadius: 30, style: .continuous).fill(Brand.orange.opacity(0.10)))
                ZMark().stroke(Brand.gradient, style: StrokeStyle(lineWidth: 12, lineCap: .round, lineJoin: .round)).frame(width: 58, height: 58)
            }
            .frame(width: 220, height: 220)
        }
        .overlay(alignment: .bottom) { Text(fileName).font(.caption).foregroundStyle(.secondary).lineLimit(1).offset(y: 24) }
        .padding(.bottom, 28)
    }
}


// MARK: macOS 26 look
// Buttons use the system styles: Liquid Glass on macOS 26 (glass / glassProminent), and the standard bordered styles before it. Both follow the
// person's system accent colour, so nothing here forces a brand colour onto a control.
extension View {
    @ViewBuilder func primaryButton() -> some View {
        if #available(macOS 26.0, *) { self.buttonStyle(.glassProminent).buttonBorderShape(.capsule) } else { self.buttonStyle(.borderedProminent) }
    }
    @ViewBuilder func secondaryButton() -> some View {
        if #available(macOS 26.0, *) { self.buttonStyle(.glass).buttonBorderShape(.capsule) } else { self.buttonStyle(.bordered) }
    }
}

/// A filled icon tile in the system accent colour (used where the app used to paint a brand-orange tile).
struct AccentTile: View {
    let symbol: String
    var size: CGFloat = 40
    var body: some View {
        Image(systemName: symbol).font(.system(size: size * 0.45, weight: .semibold)).foregroundStyle(.white)
            .frame(width: size, height: size).background(Color.accentColor.gradient, in: RoundedRectangle(cornerRadius: size * 0.27, style: .continuous))
    }
}

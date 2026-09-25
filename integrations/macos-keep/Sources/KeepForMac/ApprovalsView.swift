import CryptoKit
import KeepKit
import LocalAuthentication
import SwiftUI

/// Approvals waiting for this person. With a device key enrolled, each decision is signed on this Mac
/// (Secure Enclave, Touch ID) over the exact text the host will check.
struct ApprovalsView: View {
    @EnvironmentObject var app: AppState
    @AppStorage("deviceId") private var deviceId = ""
    @State private var enrolling = false
    @State private var operatorToken = ""
    @State private var message: String?
    @State private var enrolled = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            GroupBox("This Mac as an approver") {
                VStack(alignment: .leading, spacing: 8) {
                    if let key = try? SecureEnclaveKey.loadOrCreate() {
                        Text("A key lives in this Mac's Secure Enclave. Only its public half leaves the Mac.").font(.callout)
                        Text(key.publicKeyBase64).font(.system(.caption, design: .monospaced)).textSelection(.enabled).lineLimit(2)
                        HStack {
                            TextField("Device name", text: $deviceId).textFieldStyle(.roundedBorder).frame(maxWidth: 220)
                            Button("Enrol with an operator token…") { enrolling = true }.disabled(deviceId.isEmpty || app.userId.isEmpty)
                        }
                        if app.userId.isEmpty { Text("Set your user id in Settings first.").font(.caption).foregroundStyle(.orange) }
                    } else {
                        Text("No Secure Enclave key is available to the app on this Mac; decisions go unsigned, which a host that requires device signatures will refuse.").font(.callout).foregroundStyle(.orange)
                    }
                    if let message { Text(message).font(.callout) }
                }.padding(4)
            }.padding()
            Divider()
            if app.approvals.isEmpty {
                Text("Nothing is waiting for you.").foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(app.approvals) { a in ApprovalRow(approval: a, deviceId: deviceId, message: $message) }
            }
        }
        .navigationTitle("Approvals")
        .toolbar { Button("Refresh") { Task { await app.refreshApprovals() } } }
        .task { await app.refreshApprovals() }
        .sheet(isPresented: $enrolling) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Developer mode: enrol this Mac").font(.headline)
                Text("Enrolling needs the operator token, because a user token must not be able to add its own key. It is used once and is not stored.").font(.callout)
                SecureField("Operator token", text: $operatorToken).textFieldStyle(.roundedBorder)
                HStack { Spacer(); Button("Cancel") { enrolling = false; operatorToken = "" }; Button("Enrol") { enrol() }.keyboardShortcut(.defaultAction).disabled(operatorToken.isEmpty) }
            }.padding().frame(width: 460)
        }
    }

    private func enrol() {
        let token = operatorToken; operatorToken = ""; enrolling = false
        guard let url = URL(string: app.host), let key = try? SecureEnclaveKey.loadOrCreate(), let c = try? KeepClient(baseURL: url, token: token) else { return }
        Task {
            do { try await c.enrolDevice(user: app.userId, deviceId: deviceId, publicKeyBase64: key.publicKeyBase64, name: Host.current().localizedName ?? "Mac"); message = "Enrolled \(deviceId) for \(app.userId)." }
            catch { message = error.localizedDescription }
        }
    }
}

struct ApprovalRow: View {
    let approval: Approval
    let deviceId: String
    @Binding var message: String?
    @EnvironmentObject var app: AppState
    @State private var showPayload = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack { Text(approval.kind.capitalized).font(.headline); Text(approval.subject ?? "").foregroundStyle(.secondary); Spacer() }
            if let p = approval.prompt { Text(p) }
            if let payload = try? ApprovalPayload.text(for: approval, decision: .approved) {
                DisclosureGroup("The exact text your Mac will sign", isExpanded: $showPayload) {
                    Text(payload).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                }
            }
            HStack {
                Button("Approve") { decide(.approved) }.buttonStyle(.borderedProminent)
                Button("Deny") { decide(.denied) }
            }
        }.padding(.vertical, 6)
    }

    private func decide(_ d: Decision) {
        guard let c = app.client else { return }
        Task {
            do {
                var signature: String?
                if approval.sign != nil, !deviceId.isEmpty {
                    let signer = ApprovalSigner(key: try SecureEnclaveKey.loadOrCreate(), deviceId: deviceId)
                    signature = try signer.signature(for: approval, decision: d).signature
                }
                try await c.decide(approval: approval.id, d, deviceId: signature == nil ? nil : deviceId, signature: signature)
                message = "\(d == .approved ? "Approved" : "Denied"): \(approval.kind) \(approval.subject ?? "")"
                await app.refreshApprovals()
            } catch { message = error.localizedDescription }
        }
    }
}

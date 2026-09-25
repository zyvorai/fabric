import KeepKit
import ServiceManagement
import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var app: AppState
    @State private var host = ""
    @State private var token = ""
    @State private var launchAtLogin = SMAppService.mainApp.status == .enabled

    var body: some View {
        Form {
            Section("Keep host") {
                TextField("Address", text: $host, prompt: Text("https://keep.example.com or http://127.0.0.1:9096"))
                SecureField("User token", text: $token, prompt: Text(app.connected ? "•••••• stored in the Keychain" : "kut1…"))
                TextField("Your user id", text: app.$userId, prompt: Text("needed for usage, approvals and the inbox"))
                HStack {
                    Button("Save and connect") { Task { await app.saveConnection(host: host, token: token.isEmpty ? ((try? app.tokens.token()) ?? "") : token); token = "" } }
                        .buttonStyle(.borderedProminent)
                    if app.connected { Button("Forget the token") { app.disconnect() } }
                    if let e = app.connectionError { Text(e).foregroundStyle(.red).font(.callout) }
                }
                if let s = app.status {
                    Text("Connected. Keep mode: \(s.keepMode == true ? "on" : "off"). Use cases: \(s.demos.map { $0.builtin + $0.custom } ?? 0). Cell template: \(s.demoTemplate ?? "?").").font(.callout).foregroundStyle(.secondary)
                }
                if let u = app.usage { Text("Usage: \(u.usage.runs) runs, \(u.usage.artifacts) artifacts, \(u.usage.modelCalls) model calls.").font(.callout).foregroundStyle(.secondary) }
            }
            Section("Behaviour") {
                Toggle("Notifications", isOn: app.$notify)
                Stepper("Warn before uploading files over \(app.uploadWarnMB) MB", value: app.$uploadWarnMB, in: 1...200)
                Toggle("Open at login", isOn: $launchAtLogin).onChange(of: launchAtLogin) { _, on in
                    do { if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() } } catch { app.notice = error.localizedDescription }
                }
            }
            Section("What to know") {
                Text("Files you choose are uploaded to the host and read in a sealed cell that has no network. The evidence class is software-test: whoever operates the host could still read a cell's memory. The app never runs commands on your Mac and never drives other apps.")
                    .font(.callout).foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped).navigationTitle("Settings")
        .onAppear { host = app.host }
    }
}

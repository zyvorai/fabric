import SwiftUI

@main
struct KeepPhoneApp: App {
    @StateObject private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(model)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var model: AppModel
    @State private var tab = 0

    var body: some View {
        TabView(selection: $tab) {
            ChatsView().tabItem { Label("Chats", systemImage: "bubble.left.and.bubble.right") }.tag(0)
            ApprovalsView().tabItem { Label("Approvals", systemImage: "checkmark.shield") }
                .badge(model.pendingCount).tag(1)
            SettingsView().tabItem { Label("Settings", systemImage: "gearshape") }.tag(2)
        }
        .onAppear { if !model.isConnected { tab = 2 } }
        .task { await model.refreshApprovals() }
    }
}

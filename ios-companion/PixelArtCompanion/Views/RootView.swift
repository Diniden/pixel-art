import SwiftUI

/// App shell. Shows the discovery screen until a server is confirmed, then
/// hands the whole screen to the editor webview.
struct RootView: View {
    @State private var discovery = DiscoveryService()
    @State private var loadError: String?
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            if case let .connected(server) = discovery.phase,
               let url = server.webURL,
               loadError == nil {
                // No disconnect affordance on purpose: the webview owns the
                // whole screen, and a floating control over the editor is one
                // more thing to hit by accident while drawing. Relaunching the
                // app is the way back to discovery.
                WebView(url: url) { error in
                    loadError = error.localizedDescription
                }
                .ignoresSafeArea()
            } else {
                DiscoveryView(
                    phase: discovery.phase,
                    status: loadError ?? discovery.statusMessage,
                    onRetry: {
                        loadError = nil
                        discovery.startDiscovery()
                    },
                    onManualConnect: { address in
                        loadError = nil
                        return await discovery.connectManually(to: address)
                    }
                )
            }
        }
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        .task {
            // Only start on first appearance; a re-entry should not restart a
            // live session.
            if case .idle = discovery.phase {
                discovery.startDiscovery()
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            // Stop probing when backgrounded — iOS suspends us anyway, and a
            // half-finished sweep would resume against a stale network.
            if newPhase == .background {
                discovery.cancel()
            }
        }
    }
}

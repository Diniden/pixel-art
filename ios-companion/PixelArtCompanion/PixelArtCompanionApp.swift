import SwiftUI

/// iPad companion for the pixel-art editor.
///
/// Its whole job: find the editor running on the local network and display it
/// full-screen. Discovery lives in `Discovery/`; see `ios-companion/README.md`.
@main
struct PixelArtCompanionApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
        }
    }
}

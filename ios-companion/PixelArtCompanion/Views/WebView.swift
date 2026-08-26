import SwiftUI
import WebKit

/// Full-screen `WKWebView` showing the editor.
///
/// Configured for a drawing app rather than a document reader: no zoom bounce,
/// no text auto-sizing, and inline media. The editor manages its own layout, so
/// anything the webview does on top of that is interference.
///
/// ## Why this app forwards the Apple Pencil double-tap
///
/// **WebKit does not expose the double-tap gesture to JavaScript.** There is no
/// event and no API for it: Apple surfaces it only natively, through
/// `UIPencilInteraction`. A page in mobile Safari therefore cannot ever see the
/// gesture, however it is written.
///
/// This app is the reason the editor can have it at all. It owns the webview,
/// so it can attach the interaction and forward each double-tap into the page
/// as a DOM event. The editor listens for `pencil:doubletap` and swaps its two
/// selected tools (`usePencilDoubleTap` on the web side).
///
/// The editor must keep working without this — it is the same build that runs
/// on desktop and in Safari — so the swap is also reachable from a toolbar
/// button there. This is an enhancement, never a dependency.
struct WebView: UIViewRepresentable {
    /// Editor URL to load.
    let url: URL
    /// Called when a navigation fails, so the shell can offer a retry.
    var onLoadFailure: ((Error) -> Void)?

    func makeCoordinator() -> Coordinator {
        Coordinator(onLoadFailure: onLoadFailure)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        // The editor is a live tool; serving it from cache can show stale state.
        configuration.websiteDataStore = .nonPersistent()

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = false
        // Pinch-zoom would fight the canvas's own gesture handling.
        webView.scrollView.bouncesZoom = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black

        // The Pencil bridge. `UIPencilInteraction` reports the user's
        // system-wide preferred double-tap action; this app deliberately
        // IGNORES which action was chosen and always forwards the tap. The
        // editor decides what a double-tap means, and mapping Apple's
        // "switch eraser"/"show colour palette" vocabulary onto it would
        // silently do nothing for a user whose system setting is "off".
        let pencil = UIPencilInteraction()
        pencil.delegate = context.coordinator
        webView.addInteraction(pencil)
        context.coordinator.webView = webView

        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.onLoadFailure = onLoadFailure
        // Reload only on an actual URL change — `updateUIView` runs on every
        // state change, and reloading each time would wipe the editor's state.
        guard webView.url?.absoluteString != url.absoluteString,
              !webView.isLoading else { return }
        webView.load(URLRequest(url: url))
    }

    /// Forwards navigation failures to the shell, and Pencil double-taps to
    /// the page.
    final class Coordinator: NSObject, WKNavigationDelegate, UIPencilInteractionDelegate {
        var onLoadFailure: ((Error) -> Void)?
        /// Set once the webview exists; the interaction needs somewhere to
        /// deliver to. `weak` so the coordinator never keeps the view alive.
        weak var webView: WKWebView?

        init(onLoadFailure: ((Error) -> Void)?) {
            self.onLoadFailure = onLoadFailure
        }

        /// Apple Pencil double-tap → a DOM event in the editor.
        ///
        /// A `CustomEvent` on `window` rather than a `window.webkit`
        /// message handler in the other direction: several parts of the page
        /// can listen without coordinating, nothing has to be registered
        /// before the webview loads, and a build running outside this app
        /// simply never receives one.
        ///
        /// Fired only when the page has finished loading — evaluating into a
        /// document that does not exist yet throws, and the tap is not worth
        /// queuing. A dropped double-tap is invisible; a crash is not.
        func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
            guard let webView, !webView.isLoading, webView.url != nil else { return }
            webView.evaluateJavaScript(
                "window.dispatchEvent(new CustomEvent('pencil:doubletap'));",
                completionHandler: nil
            )
        }

        func webView(_ webView: WKWebView,
                     didFailProvisionalNavigation navigation: WKNavigation!,
                     withError error: Error) {
            // Cancellation is normal when a load is superseded — not a failure.
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            onLoadFailure?(error)
        }

        func webView(_ webView: WKWebView,
                     didFail navigation: WKNavigation!,
                     withError error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            onLoadFailure?(error)
        }
    }
}

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
///
/// ## Why this app also forwards Pencil HOVER
///
/// Same class of problem, same shape of answer. An Apple Pencil reports its
/// position while the tip is still above the glass. UIKit surfaces that
/// through `UIHoverGestureRecognizer`, but a page inside a `WKWebView` does
/// not reliably receive it as a `pointermove` with `pointerType == "pen"` —
/// so the editor cannot see the pencil approach on its own.
///
/// ══════════════════════════════════════════════════════════════════════════
///  ⚠️ HOVER IS A HARDWARE FEATURE. MOST iPad + PENCIL PAIRS DO NOT HAVE IT.
/// ══════════════════════════════════════════════════════════════════════════
///
/// Before debugging this bridge, confirm the hardware actually supports
/// hover. It requires an **M2-or-later iPad Pro / iPad Air** paired with an
/// **Apple Pencil (2nd generation), Apple Pencil Pro, or Pencil (USB-C)**.
/// Every other combination — including a 1st-gen Pencil, and a 2nd-gen Pencil
/// on a pre-M2 iPad — reports nothing at all while hovering, and no code on
/// either side of this bridge can change that.
///
/// It also requires "Show Effects when using Pencil" to be ON in
/// Settings → Apple Pencil, and the tip to be within ~1 cm of the glass.
///
/// ⚠️ The failure looks like a NEAR-MISS, which is what makes it expensive.
/// On unsupported hardware you see no marker while hovering, then a marker
/// that flickers for one frame after a tap-and-release. That flicker is NOT
/// this bridge partially working — it is the single `pointermove` Safari
/// synthesises at touch-end reaching the editor's ordinary mouse path. It
/// reads as "hover is almost working" when hover never arrived at all.
/// Measured on the owner's hardware, 2026-08-28.
///
/// This app attaches the recogniser and forwards each sample into the page as
/// `pencil:hover`. The editor draws a faint marker on the cells the active
/// tool would edit, so a stroke can be aimed before it is committed
/// (`usePencilHover` on the web side).
///
/// Same degradation rule as the double-tap: the editor also drives that
/// marker from ordinary mouse movement, so a build outside this app loses
/// nothing.
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

        // The hover bridge. See `attachHoverRecognizer` for why attaching it
        // is not a one-liner.
        context.coordinator.attachHoverRecognizer(to: webView)

        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.onLoadFailure = onLoadFailure
        // `WKContentView` does not exist until the first load commits, so the
        // attachment made in `makeUIView` may have landed on the fallback.
        // This is idempotent — it returns immediately once the host is right.
        context.coordinator.attachHoverRecognizer(to: webView)
        // Reload only on an actual URL change — `updateUIView` runs on every
        // state change, and reloading each time would wipe the editor's state.
        guard webView.url?.absoluteString != url.absoluteString,
              !webView.isLoading else { return }
        webView.load(URLRequest(url: url))
    }

    /// Forwards navigation failures to the shell, and both Pencil signals —
    /// double-tap and hover — to the page.
    final class Coordinator: NSObject, WKNavigationDelegate, UIPencilInteractionDelegate,
                             UIGestureRecognizerDelegate {
        var onLoadFailure: ((Error) -> Void)?
        /// Set once the webview exists; the interaction needs somewhere to
        /// deliver to. `weak` so the coordinator never keeps the view alive.
        weak var webView: WKWebView?

        /// Retained so a re-attach can remove the previous one.
        private weak var hoverRecognizer: UIHoverGestureRecognizer?
        /// The view the recogniser is currently on, for the same reason.
        private weak var hoverHost: UIView?

        init(onLoadFailure: ((Error) -> Void)?) {
            self.onLoadFailure = onLoadFailure
        }

        /// Attach the hover recogniser to the view that actually receives
        /// pointer input.
        ///
        /// ══════════════════════════════════════════════════════════════════
        ///  ⚠️ ATTACHING THIS TO THE `WKWebView` ITSELF DOES NOT WORK
        /// ══════════════════════════════════════════════════════════════════
        ///
        /// A `WKWebView` is a thin container. The view that WebKit actually
        /// hit-tests and delivers pointer input to is `WKContentView`, nested
        /// inside `webView.scrollView`. A hover recogniser on the OUTER view
        /// sits above that hierarchy, and the inner content view claims the
        /// events first — so `.began`/`.changed` never fire and the page sees
        /// nothing at all while the pencil hovers.
        ///
        /// The observable symptom of getting this wrong is precise and
        /// misleading: hover does nothing, but a marker flickers for one frame
        /// after a tap-and-release. That flicker is NOT this bridge — it is
        /// the single `pointermove` Safari synthesises at touch-end reaching
        /// the editor's ordinary mouse path. It looks like "hover almost
        /// works" when in fact hover never arrived.
        ///
        /// So the recogniser goes on the scroll view's first subview when
        /// there is one, and falls back to the scroll view, then the webview.
        /// The fallbacks matter because `WKContentView` is private API by
        /// name: it is found positionally, and a future WebKit could change
        /// the hierarchy. A wrong-but-present host degrades to "no hover",
        /// never to a crash.
        ///
        /// ⚠️ Called again from `updateUIView`, because the content view does
        /// not exist until the first load commits — attaching once at
        /// construction time would attach to the fallback forever.
        func attachHoverRecognizer(to webView: WKWebView) {
            // Same lifecycle problem, same hook: WebKit's touch recogniser is
            // removed and re-added as content changes, and each new one
            // arrives with UIKit's exclusive default. Re-applied here, which
            // runs on construction AND on every `updateUIView`.
            relaxTouchExclusivity(in: webView)

            let host = webView.scrollView.subviews.first
                ?? webView.scrollView as UIView

            // Already on the right view: nothing to do.
            if hoverHost === host, hoverRecognizer != nil { return }

            if let existing = hoverRecognizer, let old = hoverHost {
                old.removeGestureRecognizer(existing)
            }

            let hover = UIHoverGestureRecognizer(
                target: self,
                action: #selector(handleHover(_:))
            )
            // ⚠️ All three are load-bearing. The defaults would let this
            // recogniser interfere with touches on their way to WebKit, so the
            // pencil would light up the marker and then fail to DRAW. It must
            // observe and never claim.
            hover.cancelsTouchesInView = false
            hover.delaysTouchesBegan = false
            hover.delaysTouchesEnded = false
            // WebKit's own recognisers are already on this view. Without this
            // delegate, UIKit may make ours wait for or exclude theirs.
            hover.delegate = self

            host.addGestureRecognizer(hover)
            hoverRecognizer = hover
            hoverHost = host
        }

        /// Let the Pencil and a finger be delivered to the page at the same
        /// time.
        ///
        /// ══════════════════════════════════════════════════════════════════
        ///  THE FIX FOR "DRAWING STOPS WHEN A FINGER TOUCHES THE SCREEN"
        /// ══════════════════════════════════════════════════════════════════
        ///
        /// ## The measured symptom
        ///
        /// With the Pencil drawing on the canvas, a simultaneous finger touch
        /// was NEVER delivered to the web page: instrumented logging on the
        /// web side (2026-08-28) showed `event.touches.length` never exceeding
        /// 1 and not a single `touchType: "direct"` event arriving while the
        /// stylus was down. Two FINGERS worked perfectly, so it was not the
        /// webview refusing multi-touch.
        ///
        /// ## The cause, from Apple's own header
        ///
        /// `UIGestureRecognizer.requiresExclusiveTouchType` **defaults to
        /// `YES`**, and UIKit documents exactly this consequence:
        ///
        ///   "If YES, once it receives a touch of a certain type, it will
        ///    ignore new touches of other types, until it is reset to
        ///    UIGestureRecognizerStatePossible."
        ///
        /// WebKit funnels ALL web touch events through one private recognizer,
        /// `WKTouchEventsGestureRecognizer` on `WKContentView`, and never
        /// overrides that property. So the stylus touch latches the recogniser
        /// to `.stylus` and every finger touch is withheld until the Pencil
        /// lifts. The page is never told the finger exists, which is why no
        /// amount of JavaScript could fix it — and why the W3C Pointer Events
        /// spec says authors "cannot suppress this behavior".
        ///
        /// ## Why this is a public-API fix reached by a private route
        ///
        /// `requiresExclusiveTouchType` is PUBLIC UIKit API. What is private
        /// is the recogniser object, which is found by class NAME because
        /// there is no public handle on it.
        ///
        /// ⚠️ That makes the match version-fragile, so it FAILS SOFT: if the
        /// class is ever renamed the loop simply matches nothing and the app
        /// keeps working exactly as it does today. It must never throw, and it
        /// must never be a precondition for anything.
        ///
        /// ⚠️ Re-applied on navigation. WebKit REMOVES and re-adds this
        /// recogniser as content changes, and a fresh one carries the default
        /// again — applying once at construction would silently stop working.
        ///
        /// ## CONFIRMED WORKING on hardware, 2026-08-28
        ///
        /// Measured with the Pencil drawing on the canvas and a finger
        /// dragging a rail slider: **2,387 touch events carrying `stylus` and
        /// `direct` simultaneously**, `touches.length` reaching 3, with canvas
        /// and slider events interleaving in one stream. Before this change
        /// the same gesture produced `touches.length === 1` and not a single
        /// `direct` event for the entire stroke.
        ///
        /// ⚠️ DO NOT REMOVE THIS AS "a workaround for something that works
        /// now". Nothing on the web side can compensate — the finger touch is
        /// withheld by UIKit before WebKit ever sees it, and the Pointer
        /// Events spec (L3 §4.1.2) states authors cannot suppress the
        /// behaviour. Three separate JavaScript fixes were attempted against
        /// this symptom and all three were dead ends.
        @discardableResult
        func relaxTouchExclusivity(in view: UIView) -> Int {
            var relaxed = 0
            for recognizer in view.gestureRecognizers ?? [] {
                let name = NSStringFromClass(type(of: recognizer))
                guard name.contains("WKTouchEventsGestureRecognizer") else {
                    continue
                }
                if recognizer.requiresExclusiveTouchType {
                    recognizer.requiresExclusiveTouchType = false
                    relaxed += 1
                }
            }
            for subview in view.subviews {
                relaxed += relaxTouchExclusivity(in: subview)
            }
            return relaxed
        }

        /// Never block WebKit's own gesture handling.
        ///
        /// This recogniser observes; it must coexist with every recogniser
        /// WebKit installs for scrolling, selection and drawing rather than
        /// forcing a failure requirement on any of them.
        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
        ) -> Bool {
            true
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

        /// Apple Pencil hover → a stream of `pencil:hover` DOM events.
        ///
        /// ## Coordinates
        ///
        /// The location is taken in the WEBVIEW's own coordinate space and
        /// sent unchanged. UIKit points and CSS pixels are the same unit here:
        /// the webview is not scaled by SwiftUI, and `WKWebView` maps its
        /// bounds onto the page's client coordinate space one to one. So the
        /// values land in the page as the same space `MouseEvent.clientX` uses
        /// and the editor can feed them straight into the mapping it already
        /// has for the mouse. Sending screen coordinates, or points from the
        /// recogniser's own view, would need a second transform on the web
        /// side that could silently drift from the first.
        ///
        /// ## Phases
        ///
        /// `.began`/`.changed` send a position; `.ended`/`.cancelled`/`.failed`
        /// send `phase: "end"` with no coordinates, which is how the editor
        /// knows to remove the marker rather than leave it frozen where the
        /// pencil was lifted away.
        ///
        /// ## Why the JavaScript is built by hand and the numbers are clamped
        ///
        /// `evaluateJavaScript` takes a string, so the coordinates are
        /// interpolated into it. They are device-reported doubles: a NaN or an
        /// infinity would interpolate as `nan`/`inf`, which is not valid
        /// JavaScript and would throw inside the page on every sample. They are
        /// therefore checked, and a non-finite sample is dropped. The editor
        /// validates the payload again on its side — the two codebases ship
        /// separately, so neither trusts the other's version.
        @objc func handleHover(_ recognizer: UIHoverGestureRecognizer) {
            // ⚠️ Deliberately NOT guarded on `isLoading`, unlike the
            // double-tap. A double-tap is one discrete event that is fine to
            // drop; hover is a continuous stream, and `isLoading` goes true
            // for any subresource navigation the editor triggers while
            // running. Dropping samples for the duration would make hover die
            // intermittently, which is far harder to diagnose than the
            // evaluation being a no-op. `url != nil` still guards the only
            // case that actually throws: evaluating into a document that does
            // not exist yet.
            guard let webView, webView.url != nil else { return }

            switch recognizer.state {
            case .began, .changed:
                // ⚠️ Measured in the WEBVIEW's space even though the
                // recogniser lives on the inner content view: that inner view
                // is scrolled and inset relative to the webview, so its own
                // coordinates would be offset from the page's client space.
                // `location(in:)` converts, so this stays the same space
                // `MouseEvent.clientX` uses.
                let point = recognizer.location(in: webView)
                guard point.x.isFinite, point.y.isFinite else { return }
                webView.evaluateJavaScript(
                    """
                    window.dispatchEvent(new CustomEvent('pencil:hover', \
                    { detail: { phase: 'move', x: \(point.x), y: \(point.y) } }));
                    """,
                    completionHandler: nil
                )
            case .ended, .cancelled, .failed:
                webView.evaluateJavaScript(
                    "window.dispatchEvent(new CustomEvent('pencil:hover', " +
                    "{ detail: { phase: 'end' } }));",
                    completionHandler: nil
                )
            default:
                break
            }
        }

        /// Re-apply the touch-exclusivity relaxation once content has loaded.
        ///
        /// `makeUIView` runs before `WKContentView` exists, so the call there
        /// can match nothing. This is the point at which the recogniser is
        /// guaranteed to be present — and it fires again on every navigation,
        /// which is exactly when WebKit replaces it.
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            relaxTouchExclusivity(in: webView)
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

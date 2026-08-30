import Foundation
import Network

/// Finds pixel-art servers over Bonjour/mDNS.
///
/// This is the primary strategy and almost always the one that wins: the server
/// advertises `_pixelart._tcp` (see `server/src/discovery.ts`), and a browse
/// typically resolves in well under a second with no scanning at all.
///
/// `NWBrowser` gives us service *instances*; `NWConnection` then resolves an
/// instance to concrete endpoints. We hand those addresses to `ServerProbe` so
/// that a Bonjour hit is verified exactly like any other candidate.
final class BonjourBrowser {
    /// Must match `SERVICE_TYPE` in `server/src/discovery.ts`.
    static let serviceType = "_pixelart._tcp"

    /// Browse for advertised editors and resolve each to a host and port.
    ///
    /// - Parameter timeout: How long to listen before giving up. mDNS answers
    ///   arrive fast; anything past a couple of seconds means nothing is there.
    /// - Returns: Resolved `host:port` pairs, deduplicated.
    func browse(timeout: TimeInterval = 3.0) async -> [(host: String, port: Int)] {
        let results = await withCheckedContinuation { (continuation: CheckedContinuation<[NWBrowser.Result], Never>) in
            let parameters = NWParameters()
            parameters.includePeerToPeer = true

            let browser = NWBrowser(
                for: .bonjour(type: Self.serviceType, domain: nil),
                using: parameters
            )

            // `finish` must run exactly once: the timeout and the first results
            // callback race each other by design.
            let box = ResumeBox(continuation: continuation)

            browser.browseResultsChangedHandler = { results, _ in
                guard !results.isEmpty else { return }
                // Give slower responders a brief grace period before settling,
                // so a second editor on the LAN is not missed.
                DispatchQueue.global().asyncAfter(deadline: .now() + 0.4) {
                    box.finish(Array(browser.browseResults)) { browser.cancel() }
                }
            }

            browser.stateUpdateHandler = { state in
                // If mDNS is unavailable (blocked network, denied permission)
                // fail immediately rather than burning the whole timeout.
                if case .failed = state {
                    box.finish([]) { browser.cancel() }
                }
            }

            browser.start(queue: .global())

            DispatchQueue.global().asyncAfter(deadline: .now() + timeout) {
                box.finish(Array(browser.browseResults)) { browser.cancel() }
            }
        }

        // Resolve instances to addresses concurrently — each resolve is an
        // independent round trip.
        var resolved: [(host: String, port: Int)] = []
        await withTaskGroup(of: [(String, Int)].self) { group in
            for result in results {
                group.addTask { await Self.resolve(result) }
            }
            for await endpoints in group {
                for (host, port) in endpoints {
                    if !resolved.contains(where: { $0.host == host && $0.port == port }) {
                        resolved.append((host, port))
                    }
                }
            }
        }
        return resolved
    }

    /// Resolve one browse result into concrete host/port pairs.
    ///
    /// A `.service` endpoint carries no address until connected, so we open a
    /// short-lived connection purely to learn where it points.
    private static func resolve(_ result: NWBrowser.Result) async -> [(String, Int)] {
        guard case .service = result.endpoint else { return [] }

        return await withCheckedContinuation { (continuation: CheckedContinuation<[(String, Int)], Never>) in
            let connection = NWConnection(to: result.endpoint, using: .tcp)
            let box = ResumeBox(continuation: continuation)

            connection.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    var found: [(String, Int)] = []
                    if let inner = connection.currentPath?.remoteEndpoint,
                       case let .hostPort(host, port) = inner {
                        found.append((Self.describe(host), Int(port.rawValue)))
                    }
                    box.finish(found) { connection.cancel() }
                case .failed, .cancelled:
                    box.finish([]) { connection.cancel() }
                default:
                    break
                }
            }

            connection.start(queue: .global())

            // Bound the resolve so one unreachable advertiser cannot stall us.
            DispatchQueue.global().asyncAfter(deadline: .now() + 2.0) {
                box.finish([]) { connection.cancel() }
            }
        }
    }

    /// Render an `NWEndpoint.Host` as a dialable string, dropping the IPv6 zone
    /// suffix (`%en0`), which `URL` cannot represent.
    private static func describe(_ host: NWEndpoint.Host) -> String {
        switch host {
        case .name(let name, _):
            return name
        case .ipv4(let address):
            return "\(address)".components(separatedBy: "%").first ?? "\(address)"
        case .ipv6(let address):
            return "\(address)".components(separatedBy: "%").first ?? "\(address)"
        @unknown default:
            return "\(host)"
        }
    }
}

/// Guards a `CheckedContinuation` so it resumes exactly once.
///
/// Several callbacks race to finish a browse or resolve; resuming a
/// continuation twice is a crash, and never resuming is a hang.
private final class ResumeBox<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<T, Never>?

    init(continuation: CheckedContinuation<T, Never>) {
        self.continuation = continuation
    }

    /// Resume with `value` if this is the first call; otherwise do nothing.
    /// `cleanup` runs only for the winning caller.
    func finish(_ value: T, cleanup: () -> Void) {
        lock.lock()
        let pending = continuation
        continuation = nil
        lock.unlock()

        guard let pending else { return }
        cleanup()
        pending.resume(returning: value)
    }
}

import Foundation
import Observation

/// Where the discovery pipeline currently is. Drives the whole UI.
enum DiscoveryPhase: Equatable {
    case idle
    /// Listening for `_pixelart._tcp` advertisements.
    case bonjour
    /// Probing well-known hosts (last-known-good, `.local` names).
    case knownHosts
    /// Sweeping the local subnet. Carries progress for the UI.
    case scanning(completed: Int, total: Int)
    /// A server was confirmed; the webview takes over.
    case connected(DiscoveredServer)
    /// Every strategy came up empty.
    case unavailable
}

/// Runs the discovery strategies in order of decreasing confidence and stops at
/// the first confirmed server.
///
/// Order matters. Bonjour is instant when it works, so it goes first and the
/// expensive subnet sweep only happens when the cheap paths have all failed.
@MainActor
@Observable
final class DiscoveryService {

    /// Current pipeline phase.
    private(set) var phase: DiscoveryPhase = .idle
    /// Human-readable description of the current step.
    private(set) var statusMessage: String = ""
    /// The confirmed server, once found.
    private(set) var server: DiscoveredServer?

    /// Ports checked during scanning: the Vite dev port and the API port.
    /// Ordered — `clientPort` is what we actually want to open.
    private let clientPort = 5173
    private let apiPort = 3001

    /// Concurrent probes during a sweep. High enough to finish a /24 quickly,
    /// low enough not to exhaust the socket limit or swamp the Wi-Fi radio.
    private let scanConcurrency = 48

    private let probe = ServerProbe()
    private let bonjour = BonjourBrowser()
    private var searchTask: Task<Void, Never>?

    /// Last server that worked, retried first on the next launch.
    @ObservationIgnored
    @UserDefaultsBacked(key: "lastKnownServer") private var lastKnownServer: String?

    /// Run the full discovery pipeline, stopping at the first confirmed server.
    func startDiscovery() {
        searchTask?.cancel()
        searchTask = Task { await runPipeline() }
    }

    /// Cancel any in-flight discovery.
    func cancel() {
        searchTask?.cancel()
        searchTask = nil
    }

    /// Connect to a user-supplied `host` or `host:port`, bypassing discovery.
    ///
    /// The address is still verified through `ServerProbe`, so a typo surfaces
    /// as "not found" rather than a blank webview.
    func connectManually(to address: String) async -> Bool {
        let trimmed = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }

        let (host, port) = Self.parseAddress(trimmed, defaultPort: clientPort)
        statusMessage = "Checking \(host)…"

        guard let found = await probe.probe(host: host, clientPort: port, apiPort: apiPort) else {
            statusMessage = "No pixel-art editor at \(host):\(port)"
            return false
        }

        let manual = DiscoveredServer(
            host: found.host, port: found.port, info: found.info, source: .manual
        )
        accept(manual)
        return true
    }

    // MARK: - Pipeline

    private func runPipeline() async {
        server = nil

        // 1. Last-known-good. Costs one probe and usually wins on re-launch.
        if let remembered = lastKnownServer {
            statusMessage = "Reconnecting to \(remembered)…"
            phase = .knownHosts
            let (host, port) = Self.parseAddress(remembered, defaultPort: clientPort)
            if let found = await probe.probe(host: host, clientPort: port, apiPort: apiPort) {
                accept(found)
                return
            }
        }
        if Task.isCancelled { return }

        // 2. Bonjour — the intended path.
        phase = .bonjour
        statusMessage = "Looking for the editor on your network…"
        for (host, port) in await bonjour.browse() {
            if Task.isCancelled { return }
            if let info = await probe.fetchInfo(host: host, port: port) {
                accept(DiscoveredServer(host: host, port: info.clientPort,
                                        info: info, source: .bonjour))
                return
            }
            // Advertised port did not answer the probe; try the ports we know.
            if let found = await probe.probe(host: host, clientPort: clientPort, apiPort: apiPort) {
                accept(DiscoveredServer(host: found.host, port: found.port,
                                        info: found.info, source: .bonjour))
                return
            }
        }
        if Task.isCancelled { return }

        // 3. Well-known hostnames. Cheap, and covers mDNS-name-resolves-but-
        //    browse-is-blocked networks.
        phase = .knownHosts
        statusMessage = "Checking common addresses…"
        if let found = await probeKnownHosts() {
            accept(found)
            return
        }
        if Task.isCancelled { return }

        // 4. Subnet sweep — last resort, and the only one with real cost.
        if let found = await scanLocalSubnets() {
            accept(found)
            return
        }
        if Task.isCancelled { return }

        phase = .unavailable
        statusMessage = "No pixel-art editor found on this network."
    }

    /// Probe a small set of likely hostnames concurrently.
    private func probeKnownHosts() async -> DiscoveredServer? {
        var candidates = ["localhost", "pixel-art.local"]
        // A Mac named "Studio" answers to `studio.local`; the device's own
        // hostname is a decent guess when the server runs on this network.
        let deviceName = ProcessInfo.processInfo.hostName
        if !deviceName.isEmpty, !candidates.contains(deviceName) {
            candidates.append(deviceName)
        }

        return await firstMatch(in: candidates, concurrency: candidates.count) { host in
            await self.probe.probe(host: host, clientPort: self.clientPort, apiPort: self.apiPort)
        }
    }

    /// Sweep every active IPv4 subnet, reporting progress as it goes.
    private func scanLocalSubnets() async -> DiscoveredServer? {
        let interfaces = LocalNetwork.activeIPv4Interfaces()
        var hosts: [String] = []
        for interface in interfaces {
            for host in LocalNetwork.hostAddresses(for: interface) where !hosts.contains(host) {
                hosts.append(host)
            }
        }

        guard !hosts.isEmpty else { return nil }

        phase = .scanning(completed: 0, total: hosts.count)
        statusMessage = "Scanning \(hosts.count) addresses on your network…"

        var completed = 0
        return await firstMatch(in: hosts, concurrency: scanConcurrency) { host in
            let result = await self.probe.probe(
                host: host, clientPort: self.clientPort, apiPort: self.apiPort
            )
            await MainActor.run {
                completed += 1
                // Refresh periodically rather than per-probe; 300+ updates a
                // second would thrash the UI for no visible benefit.
                if completed % 8 == 0 || completed == hosts.count {
                    self.phase = .scanning(completed: completed, total: hosts.count)
                }
            }
            return result.map {
                DiscoveredServer(host: $0.host, port: $0.port, info: $0.info, source: .subnetScan)
            }
        }
    }

    /// Run `operation` over `items` with bounded concurrency, returning the
    /// first non-`nil` result and cancelling the rest.
    ///
    /// Keeps a fixed number of probes in flight: a sweep of 254 addresses
    /// launched all at once would exceed the per-process socket limit.
    private func firstMatch(
        in items: [String],
        concurrency: Int,
        operation: @escaping @Sendable (String) async -> DiscoveredServer?
    ) async -> DiscoveredServer? {
        await withTaskGroup(of: DiscoveredServer?.self) { group in
            var index = 0
            let limit = max(1, min(concurrency, items.count))

            for _ in 0..<limit {
                let item = items[index]
                group.addTask { await operation(item) }
                index += 1
            }

            while let result = await group.next() {
                if Task.isCancelled {
                    group.cancelAll()
                    return nil
                }
                if let result {
                    group.cancelAll()
                    return result
                }
                if index < items.count {
                    let item = items[index]
                    group.addTask { await operation(item) }
                    index += 1
                }
            }
            return nil
        }
    }

    /// Record a confirmed server and move to the connected phase.
    private func accept(_ found: DiscoveredServer) {
        server = found
        lastKnownServer = "\(found.host):\(found.port)"
        statusMessage = "Connected to \(found.info.name)"
        phase = .connected(found)
    }

    /// Split `host:port`, tolerating bracketed IPv6 literals.
    static func parseAddress(_ value: String, defaultPort: Int) -> (host: String, port: Int) {
        var text = value
        // Strip a scheme if the user pasted a full URL.
        for prefix in ["http://", "https://"] where text.hasPrefix(prefix) {
            text = String(text.dropFirst(prefix.count))
        }
        text = text.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        // Bracketed IPv6: [fd00::1]:5173
        if text.hasPrefix("["), let close = text.firstIndex(of: "]") {
            let host = String(text[text.index(after: text.startIndex)..<close])
            let rest = text[text.index(after: close)...]
            if rest.hasPrefix(":"), let port = Int(rest.dropFirst()) {
                return (host, port)
            }
            return (host, defaultPort)
        }

        // Bare IPv6 has multiple colons and therefore no port to split off.
        let colons = text.filter { $0 == ":" }.count
        if colons == 1, let idx = text.lastIndex(of: ":"),
           let port = Int(text[text.index(after: idx)...]) {
            return (String(text[..<idx]), port)
        }
        return (text, defaultPort)
    }
}

/// Minimal `UserDefaults` property wrapper for the last-known-good address.
@propertyWrapper
struct UserDefaultsBacked<Value> {
    let key: String
    var wrappedValue: Value? {
        get { UserDefaults.standard.object(forKey: key) as? Value }
        nonmutating set {
            if let newValue {
                UserDefaults.standard.set(newValue, forKey: key)
            } else {
                UserDefaults.standard.removeObject(forKey: key)
            }
        }
    }
    init(key: String) { self.key = key }
}

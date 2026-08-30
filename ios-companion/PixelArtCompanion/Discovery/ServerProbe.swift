import Foundation

/// Verifies whether a given host:port is a real pixel-art editor.
///
/// Every discovery strategy funnels through here, so "found a server" always
/// means the same thing: something answered `/api/discovery` with a payload
/// whose `service` field is `pixel-art`. An arbitrary web server on port 5173
/// fails this check and is discarded.
struct ServerProbe {
    /// Per-probe timeout. Deliberately short: a subnet sweep issues hundreds of
    /// these, and an unreachable address must fail fast rather than hold a slot.
    let timeout: TimeInterval
    private let session: URLSession

    init(timeout: TimeInterval = 1.5) {
        self.timeout = timeout

        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = timeout
        config.timeoutIntervalForResource = timeout
        // A scan makes many short-lived requests; caching and cookies are pure
        // overhead and could return a stale identity.
        config.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        config.httpCookieAcceptPolicy = .never
        config.httpShouldSetCookies = false
        config.waitsForConnectivity = false
        self.session = URLSession(configuration: config)
    }

    /// Probe `host` for the editor.
    ///
    /// - Parameters:
    ///   - host: IPv4/IPv6 literal or hostname. IPv6 literals are bracketed here.
    ///   - clientPort: Port the editor UI is expected on; also where we probe
    ///     the API through Vite's proxy.
    ///   - apiPort: Direct API port, tried when the client port does not answer
    ///     (e.g. the client is built and served elsewhere).
    /// - Returns: The confirmed server, or `nil` if this host is not the editor.
    func probe(host: String, clientPort: Int, apiPort: Int?) async -> DiscoveredServer? {
        // Vite proxies /api to the Express server, so the client port usually
        // answers both. Try it first — it is the port we ultimately want.
        if let info = await fetchInfo(host: host, port: clientPort) {
            return DiscoveredServer(
                host: host,
                port: info.clientPort,
                info: info,
                source: .knownHost
            )
        }

        // The client port did not answer. The API may still be reachable
        // directly, and it reports which port actually serves the UI.
        if let apiPort, apiPort != clientPort,
           let info = await fetchInfo(host: host, port: apiPort) {
            return DiscoveredServer(
                host: host,
                port: info.clientPort,
                info: info,
                source: .knownHost
            )
        }

        return nil
    }

    /// Fetch and validate `/api/discovery` from one exact host:port.
    ///
    /// Returns `nil` for any failure — unreachable, non-200, unparseable, or a
    /// valid JSON body that is not a pixel-art server.
    func fetchInfo(host: String, port: Int) async -> DiscoveryInfo? {
        guard let url = Self.discoveryURL(host: host, port: port) else { return nil }

        var request = URLRequest(url: url)
        request.timeoutInterval = timeout
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return nil
            }
            let info = try JSONDecoder().decode(DiscoveryInfo.self, from: data)
            // The decisive check: something answered, but is it *us*?
            guard info.isPixelArtServer else { return nil }
            return info
        } catch {
            // Timeouts and refusals are the expected case during a sweep.
            return nil
        }
    }

    /// Build `http://host:port/api/discovery`, bracketing IPv6 literals.
    static func discoveryURL(host: String, port: Int) -> URL? {
        URL(string: "http://\(bracketed(host)):\(port)/api/discovery")
    }

    /// Wrap bare IPv6 literals in brackets so they are valid in a URL authority.
    static func bracketed(_ host: String) -> String {
        guard host.contains(":"), !host.hasPrefix("[") else { return host }
        return "[\(host)]"
    }
}

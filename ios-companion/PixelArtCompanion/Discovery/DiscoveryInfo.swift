import Foundation

/// Identity payload returned by `GET /api/discovery` on the pixel-art server.
///
/// Mirrors `DiscoveryInfo` in `server/src/discovery.ts`. Bump `version` on both
/// sides together if the shape changes.
struct DiscoveryInfo: Codable, Equatable {
    /// Always `"pixel-art"` for a genuine editor host.
    let service: String
    /// Human-readable server name, shown while connecting.
    let name: String
    /// Port serving the editor UI — this is what the webview opens.
    let clientPort: Int
    /// Port serving the REST API.
    let apiPort: Int
    /// Project currently open on the server, when known.
    let currentProject: String?
    /// Every non-loopback address the server believes it is reachable on.
    let addresses: [String]
    /// Discovery contract version.
    let version: Int

    /// Marker distinguishing this editor from any other host on the same port.
    static let expectedService = "pixel-art"

    /// Whether this payload came from a real pixel-art server.
    var isPixelArtServer: Bool { service == DiscoveryInfo.expectedService }
}

/// A confirmed pixel-art server: an address that answered a probe, plus the
/// identity it reported.
struct DiscoveredServer: Identifiable, Equatable {
    /// Host as dialled — an IPv4/IPv6 literal or a `.local` hostname.
    let host: String
    /// Port serving the editor UI.
    let port: Int
    /// Identity payload returned by the server.
    let info: DiscoveryInfo
    /// How this server was found, for display and diagnostics.
    let source: DiscoverySource

    var id: String { "\(host):\(port)" }

    /// URL the webview should load.
    var webURL: URL? {
        var components = URLComponents()
        components.scheme = "http"
        // IPv6 literals must be bracketed in a URL authority.
        components.host = host
        components.port = port
        return components.url
    }
}

/// Which strategy surfaced a server. Ordered by how much we trust it.
enum DiscoverySource: String, Equatable {
    /// Found via Bonjour/mDNS — fast and unambiguous.
    case bonjour
    /// Found by probing a well-known host (localhost, a `.local` name).
    case knownHost
    /// Found by sweeping the local subnet.
    case subnetScan
    /// Entered by the user, or restored from a previous session.
    case manual

    var label: String {
        switch self {
        case .bonjour: return "Bonjour"
        case .knownHost: return "Known host"
        case .subnetScan: return "Network scan"
        case .manual: return "Manual"
        }
    }
}

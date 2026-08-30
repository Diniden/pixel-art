import Foundation

/// Reads the device's own IPv4 configuration so the scanner knows which subnet
/// to sweep.
///
/// Uses `getifaddrs` because there is no higher-level API that exposes the
/// netmask, and without a netmask we cannot tell a /24 from a /16 — the
/// difference between 254 probes and 65,534.
enum LocalNetwork {

    /// One IPv4 interface: our address and its mask.
    struct Interface {
        let name: String
        let address: String
        let netmask: String
    }

    /// Wi-Fi / Ethernet IPv4 interfaces, excluding loopback and cellular.
    ///
    /// Cellular is excluded deliberately: sweeping a carrier subnet finds
    /// nothing and probes strangers' addresses.
    static func activeIPv4Interfaces() -> [Interface] {
        var interfaces: [Interface] = []
        var head: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&head) == 0, let first = head else { return [] }
        defer { freeifaddrs(head) }

        for pointer in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let flags = Int32(pointer.pointee.ifa_flags)
            // Interface must be up, running, and not loopback.
            guard flags & IFF_UP == IFF_UP,
                  flags & IFF_RUNNING == IFF_RUNNING,
                  flags & IFF_LOOPBACK == 0,
                  let rawAddr = pointer.pointee.ifa_addr,
                  rawAddr.pointee.sa_family == UInt8(AF_INET),
                  let rawMask = pointer.pointee.ifa_netmask
            else { continue }

            let name = String(cString: pointer.pointee.ifa_name)
            // en* = Wi-Fi/Ethernet, bridge* = hotspot. pdp_ip* is cellular.
            guard name.hasPrefix("en") || name.hasPrefix("bridge") else { continue }

            guard let address = Self.string(from: rawAddr),
                  let netmask = Self.string(from: rawMask) else { continue }

            interfaces.append(Interface(name: name, address: address, netmask: netmask))
        }
        return interfaces
    }

    /// Format a `sockaddr` as a numeric IPv4 string.
    private static func string(from addr: UnsafeMutablePointer<sockaddr>) -> String? {
        var buffer = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        let result = getnameinfo(
            addr, socklen_t(addr.pointee.sa_len),
            &buffer, socklen_t(buffer.count),
            nil, 0, NI_NUMERICHOST
        )
        guard result == 0 else { return nil }
        return String(cString: buffer)
    }

    /// Every other host address on `interface`'s subnet.
    ///
    /// Skips the network address, the broadcast address, and our own address.
    /// Returns `[]` for subnets wider than `maxHosts`, because sweeping a /16 is
    /// not something to attempt from a tablet.
    ///
    /// - Parameter maxHosts: Refuse to enumerate a subnet larger than this.
    static func hostAddresses(for interface: Interface, maxHosts: Int = 1024) -> [String] {
        guard let address = ipv4ToUInt32(interface.address),
              let mask = ipv4ToUInt32(interface.netmask) else { return [] }

        let network = address & mask
        let broadcast = network | ~mask
        // Host count excludes the network and broadcast addresses.
        let count = Int(broadcast - network) - 1
        guard count > 0, count <= maxHosts else { return [] }

        var hosts: [String] = []
        hosts.reserveCapacity(count)
        var candidate = network + 1
        while candidate < broadcast {
            if candidate != address {
                hosts.append(uint32ToIPv4(candidate))
            }
            candidate += 1
        }
        return hosts
    }

    /// Parse dotted-quad IPv4 into host-order `UInt32`.
    static func ipv4ToUInt32(_ value: String) -> UInt32? {
        let parts = value.split(separator: ".")
        guard parts.count == 4 else { return nil }
        var result: UInt32 = 0
        for part in parts {
            guard let octet = UInt32(part), octet <= 255 else { return nil }
            result = (result << 8) | octet
        }
        return result
    }

    /// Render a host-order `UInt32` as dotted-quad IPv4.
    static func uint32ToIPv4(_ value: UInt32) -> String {
        "\((value >> 24) & 0xFF).\((value >> 16) & 0xFF).\((value >> 8) & 0xFF).\(value & 0xFF)"
    }
}

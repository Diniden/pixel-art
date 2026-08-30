import SwiftUI

/// Status screen shown while searching, and when nothing is found.
struct DiscoveryView: View {
    /// Pipeline phase driving the display.
    let phase: DiscoveryPhase
    /// Current human-readable status line.
    let status: String
    /// Restart discovery.
    let onRetry: () -> Void
    /// Connect to a hand-entered address.
    let onManualConnect: (String) async -> Bool

    @State private var manualAddress = ""
    @State private var showManualEntry = false
    @State private var manualFailed = false
    @State private var isConnecting = false

    private var isSearching: Bool {
        switch phase {
        case .idle, .connected, .unavailable: return false
        case .bonjour, .knownHosts, .scanning: return true
        }
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 28) {
                Image(systemName: isSearching ? "antenna.radiowaves.left.and.right" : "wifi.exclamationmark")
                    .font(.system(size: 64, weight: .light))
                    .foregroundStyle(isSearching ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
                    .symbolEffect(.variableColor.iterative, isActive: isSearching)

                VStack(spacing: 10) {
                    Text(isSearching ? "Looking for Pixel Art" : "Editor Unavailable")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.white)

                    Text(status)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 460)
                }

                if case let .scanning(completed, total) = phase, total > 0 {
                    ProgressView(value: Double(completed), total: Double(total))
                        .frame(maxWidth: 320)
                }

                if !isSearching {
                    unavailableActions
                }
            }
            .padding(40)
        }
        .animation(.easeInOut(duration: 0.25), value: isSearching)
    }

    /// Retry and manual-entry controls, shown once the search has given up.
    @ViewBuilder
    private var unavailableActions: some View {
        VStack(spacing: 18) {
            Text("Make sure the editor is running with `bun run dev` and that this iPad is on the same Wi-Fi network.")
                .font(.footnote)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)

            HStack(spacing: 14) {
                Button(action: onRetry) {
                    Label("Search Again", systemImage: "arrow.clockwise")
                        .frame(minWidth: 130)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button {
                    showManualEntry.toggle()
                } label: {
                    Label("Enter Address", systemImage: "keyboard")
                        .frame(minWidth: 130)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }

            if showManualEntry {
                VStack(spacing: 10) {
                    TextField("192.168.1.42:5173", text: $manualAddress)
                        .textFieldStyle(.roundedBorder)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .frame(maxWidth: 320)
                        .onSubmit { Task { await submitManual() } }

                    if manualFailed {
                        Text("Could not reach an editor at that address.")
                            .font(.caption)
                            .foregroundStyle(.red)
                    }

                    Button("Connect") { Task { await submitManual() } }
                        .buttonStyle(.borderedProminent)
                        .disabled(manualAddress.isEmpty || isConnecting)
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: showManualEntry)
        .animation(.easeInOut(duration: 0.2), value: manualFailed)
    }

    /// Attempt the manual connection, surfacing failure inline.
    private func submitManual() async {
        guard !manualAddress.isEmpty, !isConnecting else { return }
        isConnecting = true
        manualFailed = false
        let ok = await onManualConnect(manualAddress)
        isConnecting = false
        manualFailed = !ok
    }
}

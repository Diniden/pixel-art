/**
 * How the canvas renders the layers that are NOT the focused (selected)
 * variant layer while a variant is being edited.
 *
 *  - `"normal"`      — full opacity, as if nothing were focused.
 *  - `"transparent"` — the historical dim (regular ×0.5, other variants ×0.7).
 *  - `"onion"`       — outline only: cells with at least one empty 4-adjacent
 *                      neighbour, semi-transparent, in their actual colour.
 *
 * Declared here (not in `types/`) because it is a view-only setting — it never
 * touches the persisted `uiState` wire format. `ViewportUIStore` carries the
 * structurally-identical inline union; stores do not import from `ui/`.
 */
export type LayerFocusMode = "normal" | "transparent" | "onion";

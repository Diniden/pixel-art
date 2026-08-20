/**
 * Region stubs for the layout stories (REFRESH task 37).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 WHY A LAYOUT STORY SHOWS STUBS AND NOT THE REAL EDITOR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Because the alternative is not a better story — it is no story at all.
 *
 * Every real region is a container: an `observer()` that reads a store. A
 * layout story built from real regions would need a `StoreProvider`, an
 * `ApplicationStore` and `installBridge`, and gate 2 of this task is precisely
 * that **layout stories render with NO store provider**. The stub is not a
 * compromise forced by convenience; it is what makes the gate meaningful.
 *
 * A layout story's job is to verify ARRANGEMENT:
 *
 *   - focus mode removes the left sidebar and the bottom timeline;
 *   - the canvas area is the flex-grow child between two 320px sidebars;
 *   - the floating panels sit INSIDE the canvas area, not beside it;
 *   - the lighting layout has four fewer regions than the pixel layout.
 *
 * None of those questions is answered better by a real `LayerPanel`. What each
 * region CONTAINS is covered by that region's own stories, and the fully
 * composed screen is covered by the running app.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ NOT A COMPONENT DIRECTORY — no CSS, no BEM, no class names
 * ══════════════════════════════════════════════════════════════════════════
 *
 * These stubs use inline styles ONLY. They must not introduce a single class
 * name: `scripts/check-classes.mjs` audits declared-vs-referenced classes
 * across the codebase, and a story-only class would either register as dead or
 * force a rule into a real stylesheet to satisfy it. The colours are literal
 * because a stub is scaffolding, not a themed surface — it must be visually
 * distinguishable from real chrome at a glance.
 *
 * The three density presets are named after the shared project fixtures
 * (`projectEmpty` / `projectTypical` / `projectDense`) so the story names line
 * up with the rest of the Storybook tree, but they deliberately do NOT import
 * those fixtures: a stub renders a labelled box and a row count, and threading
 * 294,912 real pixel cells through a layout story to draw "8 layers" would be
 * exactly the kind of grid-across-the-boundary move R2 forbids.
 */
import type { CSSProperties, ReactNode } from "react";

/** How much furniture a stub pretends to hold. */
export type Density = "empty" | "typical" | "dense";

/** Rows each density gives a list-shaped region. */
const ROWS: Record<Density, number> = {
  empty: 0,
  typical: 4,
  dense: 14,
};

const BOX: CSSProperties = {
  border: "1px dashed #4a4a6a",
  borderRadius: 6,
  color: "#a0a0b8",
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
  padding: 8,
  minHeight: 0,
};

/** A labelled placeholder for a region that is just chrome. */
export function StubRegion({
  label,
  height,
  grow,
  style,
  children,
}: {
  label: string;
  height?: number | string;
  grow?: boolean;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        ...BOX,
        height,
        flex: grow ? "1 1 auto" : "0 0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        overflow: "hidden",
        ...style,
      }}
    >
      <strong style={{ color: "#e8e8f0", fontWeight: 600 }}>{label}</strong>
      {children}
    </div>
  );
}

/** A region that shows `density`-many fake rows, so density is visible. */
export function StubList({
  label,
  density,
  grow,
}: {
  label: string;
  density: Density;
  grow?: boolean;
}) {
  const rows = ROWS[density];
  return (
    <StubRegion label={`${label} (${rows})`} grow={grow}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, overflow: "auto" }}>
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            style={{
              background: "#22222f",
              borderRadius: 4,
              height: 22,
              flex: "0 0 auto",
            }}
          />
        ))}
      </div>
    </StubRegion>
  );
}

/** The centre region. Grows, so it proves the flex arrangement. */
export function StubCanvas({ label = "Canvas" }: { label?: string }) {
  return (
    <div
      style={{
        ...BOX,
        flex: "1 1 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#e8e8f0",
        minHeight: 0,
      }}
    >
      {label}
    </div>
  );
}

/**
 * A floating panel stub, absolutely positioned inside the canvas area.
 *
 * Positioned rather than in-flow deliberately: the real panels float over the
 * canvas on the `FloatingPanel` primitive, and a story that stacked them in
 * flow would show an arrangement the app never produces.
 */
export function StubFloatingPanel({
  label,
  top,
  right,
  left,
}: {
  label: string;
  top: number;
  right?: number;
  left?: number;
}) {
  return (
    <div
      style={{
        ...BOX,
        position: "absolute",
        top,
        right,
        left,
        width: 160,
        background: "#16161f",
        zIndex: 2,
      }}
    >
      {label}
    </div>
  );
}

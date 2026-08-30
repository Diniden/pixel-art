/**
 * thumbWidgets — the data every Other Hand section is described in.
 *
 * A section does not hand the surface JSX; it hands it a list of WIDGET
 * SPECS, and the surface renders, positions and drags them. That is what lets
 * every tool get the mode for the price of a list: the pencil is "one slider
 * and two button stacks", the colour picker is "three or four sliders", the
 * light settings are "seven sliders". None of them know how a widget is drawn
 * or moved.
 *
 * Two kinds, on purpose, plus one exception. A thumb on the edge of an iPad
 * can do exactly two things well — slide along a track and tap a big target —
 * and every option a rail section exposes is one of those. A toggle is a
 * one-button stack; a choice is an N-button stack with one active; an action
 * is a button with no `active` at all.
 *
 * The exception is the direction SPHERE (`normal`): a light direction or a
 * brush normal is two degrees of freedom, and reducing it to two sliders
 * loses the whole point of the picker. The sphere is a big round drag target
 * — thumb-sized in its own right — so it earns its place on the stage.
 *
 * `ui/` boundary: types only.
 */
import type { Normal } from "../../../types";

export interface ThumbSliderSpec {
  kind: "slider";
  /** Stable id — the key the widget's position is persisted under. */
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  /** Defaults to 1. Fractional steps are allowed (the gaussian radius). */
  step?: number;
  onChange: (value: number) => void;
  /** Fired once when the thumb touches the track — the undo pre-image hook. */
  onDragStart?: () => void;
  /** Fired once when the thumb lifts — the debounced undo-commit hook. */
  onDragEnd?: () => void;
  /**
   * A CSS background for the track, bottom to top (e.g. a hue rainbow or the
   * current colour's lightness ramp). Omitted, the track is the neutral one.
   */
  trackBackground?: string;
  /** How to print the value. Defaults to the integer / one-decimal number. */
  format?: (value: number) => string;
}

export interface ThumbButtonSpec {
  id: string;
  label: string;
  /** Present for a choice/toggle; absent for a one-shot action. */
  active?: boolean;
  onClick: () => void;
  title?: string;
}

export interface ThumbButtonsSpec {
  kind: "buttons";
  id: string;
  label: string;
  buttons: ThumbButtonSpec[];
}

/** A direction sphere — the `NormalPicker`, thumb-sized. */
export interface ThumbNormalSpec {
  kind: "normal";
  id: string;
  label: string;
  normal: Normal;
  onChange: (normal: Normal) => void;
  /** Presentation: amber (light direction) vs cyan (brush normal). */
  isLightDirection?: boolean;
}

export type ThumbWidgetSpec =
  ThumbSliderSpec | ThumbButtonsSpec | ThumbNormalSpec;

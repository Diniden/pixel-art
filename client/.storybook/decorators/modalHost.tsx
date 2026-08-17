import { useState } from "react";
import type { Decorator } from "@storybook/react-vite";

/**
 * A local containing block for `position: fixed` modals.
 *
 * 14 modals in this codebase use `position: fixed`. Rendered in a story they
 * escape the canvas and cover the whole Storybook iframe — including the addon
 * panels, because current z-index values reach 99999. (The z-index scale in
 * task 12 fixes the stacking half of that as a side effect.)
 *
 * The containment trick is `transform`: a non-`none` transform on an ancestor
 * makes that element the containing block for its `position: fixed`
 * descendants, so the modal lays out inside this box instead of the viewport.
 * `transform: translateZ(0)` is a no-op visually and is what does the work —
 * `position: relative` alone does NOT contain `fixed`.
 *
 * The host element is also handed to the story as a `container` prop. This is
 * exactly why the `Modal` primitive (task 12) takes
 * `container?: HTMLElement | null` rather than hard-coding `document.body`:
 * a portal target that a story can supply is a portal target that a test can
 * supply too.
 *
 * Usage in a story file:
 *
 *   export default {
 *     component: SomeModal,
 *     decorators: [modalHost],
 *   } satisfies Meta<typeof SomeModal>;
 *
 * `modalHostStyle` is exported separately for the rare story that needs the
 * containing block without the `container` prop plumbing.
 */
export const modalHostStyle: React.CSSProperties = {
  position: "relative",
  // Establishes the containing block for `position: fixed` descendants.
  transform: "translateZ(0)",
  width: "100%",
  height: "100%",
  minHeight: "24rem",
  overflow: "hidden",
  background: "var(--bg-primary)",
};

/**
 * The decorator's body, as a real capitalised component.
 *
 * A Storybook `Decorator` IS rendered as a component, so calling hooks in one is
 * legitimate — but its lowercase name makes `react-hooks/rules-of-hooks` reject
 * it, correctly, since the rule cannot know Storybook's calling convention.
 * Hoisting the hook into `ModalHost` satisfies the rule honestly rather than
 * suppressing it, and keeps the rule at full `error` strength for `.storybook/`.
 */
function ModalHost({
  Story,
  args,
}: {
  Story: Parameters<Decorator>[0];
  args: Record<string, unknown>;
}) {
  // `useState` (not `useRef`) so that the ref callback firing causes a second
  // render — on the first render `container` is null and a portal-based modal
  // would have nowhere to go.
  const [host, setHost] = useState<HTMLElement | null>(null);

  return (
    <div ref={setHost} style={modalHostStyle} data-storybook-modal-host="">
      <Story args={{ ...args, container: host }} />
    </div>
  );
}

export const modalHost: Decorator = (Story, context) => (
  <ModalHost Story={Story} args={context.args} />
);

export default modalHost;

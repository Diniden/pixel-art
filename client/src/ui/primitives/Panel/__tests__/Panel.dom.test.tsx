import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Panel } from "../Panel";

describe("Panel", () => {
  it("renders header + body", () => {
    const { container } = render(<Panel title="Layers">Body</Panel>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders stacked header with actions and stack body", () => {
    const { container } = render(
      <Panel
        title="Layers"
        headerVariant="stacked"
        bodyVariant="stack"
        headerActions={<button type="button">all</button>}
      >
        Body
      </Panel>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders headerless with compact/dense modifiers unset", () => {
    const { container } = render(<Panel bodyVariant="dense">Body</Panel>);
    expect(container.firstChild).toMatchSnapshot();
  });
});

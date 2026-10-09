/**
 * AlertBanner action placement. `inline` (the default every existing caller
 * relies on) keeps the action in its own column beside the text; `below` puts it
 * under the description, inside the text column, so wide actions cannot squeeze
 * the message.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { AlertBanner } from "../../src/components/shared/alert-banner";

function renderBanner(actionPlacement?: "inline" | "below") {
  render(
    <AlertBanner
      status="warning"
      title="This address already has a community."
      description="Ask to join it instead."
      actionPlacement={actionPlacement}
      action={<button type="button">Request to join</button>}
    />,
  );
  return {
    textColumn: screen.getByText("Ask to join it instead.").parentElement,
    action: screen.getByRole("button", { name: "Request to join" }),
  };
}

describe("AlertBanner actionPlacement", () => {
  it("keeps the action beside the text by default", () => {
    const { textColumn, action } = renderBanner();
    expect(textColumn).not.toContainElement(action);
  });

  it("puts the action under the description with placement below", () => {
    const { textColumn, action } = renderBanner("below");
    expect(textColumn).toContainElement(action);
  });

  it("renders the action exactly once either way", () => {
    renderBanner("below");
    expect(screen.getAllByRole("button", { name: "Request to join" })).toHaveLength(1);
  });
});

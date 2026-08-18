import axe from "axe-core";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IdentityFrame } from "./identity-frame";

describe("IdentityFrame accessibility", () => {
  it("has no automated accessibility violations in the identity layout", async () => {
    const { container } = render(
      <IdentityFrame
        eyebrow="Authorized access"
        title="Sign in"
        description="Verify your identity before continuing."
      >
        <form>
          <label htmlFor="identity-email">Email address</label>
          <input id="identity-email" type="email" />
          <button type="submit">Continue</button>
        </form>
      </IdentityFrame>,
    );

    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders children with the given tone", () => {
    render(<StatusBadge tone="success">Active</StatusBadge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("can hide the decorative dot", () => {
    const { container } = render(
      <StatusBadge tone="warning" dot={false}>
        Low stock
      </StatusBadge>,
    );
    expect(container.querySelector("[aria-hidden]")).toBeNull();
    expect(screen.getByText("Low stock")).toBeInTheDocument();
  });
});

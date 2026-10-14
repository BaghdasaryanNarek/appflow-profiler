import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import HomePage from "@/app/page";

describe("HomePage Smoke Test", () => {
  it("renders the placeholder title", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1, name: "AppFlow Profiler" })).toBeInTheDocument();
  });

  it("passes accessibility scan with zero violations", async () => {
    const { container } = render(<HomePage />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

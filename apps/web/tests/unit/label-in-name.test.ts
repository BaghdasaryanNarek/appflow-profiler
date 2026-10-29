import { describe, expect, it } from "vitest";
import {
  curateWords,
  getAccessibleName,
  getVisibleText,
  hasAuthorSuppliedName,
  isLabelInName,
} from "../helpers/label-in-name";

describe("label-in-name helper", () => {
  it("curates words like axe-core: case, punctuation and parentheticals are ignored", () => {
    expect(curateWords("LOD: Detail")).toEqual(["lod", "detail"]);
    expect(curateWords("1.2k rps")).toEqual(["1", "2k", "rps"]);
    expect(curateWords("orders-svc (svc:orders-svc)")).toEqual(["orders", "svc"]);
  });

  it("accepts visible text at the start of, or inside, the name", () => {
    expect(isLabelInName("LOD: Detail", "LOD: Detail, toggle level of detail grouping")).toBe(true);
    expect(isLabelInName("1.2k rps", "1.2k rps, edge svc:a to svc:b")).toBe(true);
    expect(isLabelInName("orders-svc", "Service orders-svc, health healthy")).toBe(true);
  });

  it("ignores parenthesised visible text", () => {
    expect(isLabelInName("orders-svc (svc:orders-svc)", "orders-svc, inspect")).toBe(true);
  });

  it("rejects names that miss, reorder or split the visible words", () => {
    expect(isLabelInName("LOD: Detail", "Toggle Level of Detail Grouping")).toBe(false);
    expect(isLabelInName("1.2k rps", "1,234 requests per second")).toBe(false);
    expect(isLabelInName("RPS 1.2k p99 45ms", "RPS 1.2k, health ok, p99 45ms")).toBe(false);
  });

  it("treats empty visible text as matching", () => {
    expect(isLabelInName("", "Zoom In")).toBe(true);
  });

  function span(text: string, attrs: Record<string, string> = {}): HTMLSpanElement {
    const el = document.createElement("span");
    el.textContent = text;
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
  }

  it("excludes off-screen (sr-only, hidden) text but keeps aria-hidden text, like axe", () => {
    const button = document.createElement("button");
    button.append(
      span("Service", { class: "sr-only" }),
      span("orders-svc"),
      span(" details", { hidden: "" }),
      span(" Healthy", { "aria-hidden": "true" }),
    );
    expect(getVisibleText(button)).toBe("orders-svc Healthy");
  });

  it("joins adjacent elements without a separator, like axe", () => {
    const pill = document.createElement("button");
    pill.append(span("36.66"), span("rps"));
    expect(getVisibleText(pill)).toBe("36.66rps");
    expect(isLabelInName(getVisibleText(pill), "36.66 rps, edge a to b")).toBe(false);

    pill.replaceChildren(span("36.66"), document.createTextNode(" "), span("rps"));
    expect(isLabelInName(getVisibleText(pill), "36.66 rps, edge a to b")).toBe(true);
  });

  it("only checks elements whose name is author-supplied", () => {
    const card = document.createElement("div");
    expect(hasAuthorSuppliedName(card)).toBe(false);
    card.setAttribute("aria-label", "  ");
    expect(hasAuthorSuppliedName(card)).toBe(false);
    card.setAttribute("aria-label", "Service orders-svc");
    expect(hasAuthorSuppliedName(card)).toBe(true);
  });

  it("reads the accessible name computed by Testing Library", () => {
    const button = document.createElement("button");
    button.setAttribute("aria-label", "LOD: Detail, toggle level of detail grouping");
    button.textContent = "LOD: Detail";
    document.body.append(button);
    try {
      expect(getAccessibleName(button)).toBe("LOD: Detail, toggle level of detail grouping");
    } finally {
      button.remove();
    }
  });
});

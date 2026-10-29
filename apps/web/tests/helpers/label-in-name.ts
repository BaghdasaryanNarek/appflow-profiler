import { queryAllByRole, type ByRoleMatcher } from "@testing-library/react";
import { expect } from "vitest";

/**
 * WCAG 2.5.3 (Label in Name) check for jsdom.
 *
 * axe-core's `label-content-name-mismatch` needs layout to decide what is
 * visible, so it cannot run meaningfully under jsdom. This helper mirrors the
 * rule as implemented in axe-core 4.14:
 * - it only applies to elements with an author-supplied name (`aria-label` or
 *   `aria-labelledby`); a name computed from content contains the content;
 * - visible text is the concatenation of descendant text nodes with no
 *   separator added between elements (so `<b>36</b><i>rps</i>` reads
 *   "36rps"); `aria-hidden` text still counts, text inside `hidden` or
 *   `.sr-only` subtrees (off screen) does not;
 * - both strings are lower-cased, NFKD-normalised, stripped of parenthesised
 *   text and split on every non-letter/number, and the visible words must
 *   appear contiguously in the name.
 */

const NON_LETTER_OR_NUMBER = /[^\p{L}\p{N}]+/gu;

export function curateWords(text: string): string[] {
  let curated = text.normalize("NFKD").toLowerCase();
  let previous: string;
  do {
    previous = curated;
    curated = curated.replace(/\([^()]*\)/g, " ");
  } while (curated !== previous);
  return curated.replace(NON_LETTER_OR_NUMBER, " ").split(/\s+/).filter(Boolean);
}

export function isLabelInName(visibleText: string, accessibleName: string): boolean {
  const label = curateWords(visibleText);
  if (label.length === 0) return true;
  const name = curateWords(accessibleName);
  for (let start = 0; start + label.length <= name.length; start++) {
    if (label.every((word, offset) => word === name[start + offset])) return true;
  }
  return false;
}

export function getVisibleText(element: Element): string {
  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.hasAttribute("hidden") || node.classList.contains("sr-only")) return;
    node.childNodes.forEach(walk);
  };
  element.childNodes.forEach(walk);
  return parts.join("").replace(/\s+/g, " ").trim();
}

/** Accessible name as Testing Library computes it (dom-accessibility-api). */
export function getAccessibleName(element: HTMLElement, role: ByRoleMatcher = "button"): string {
  let computed: string | undefined;
  queryAllByRole(element.ownerDocument.body, role, {
    name: (name, candidate) => {
      if (candidate === element) computed = name;
      return candidate === element;
    },
  });
  if (computed === undefined) {
    throw new Error(`Element is not exposed with role "${String(role)}"`);
  }
  return computed;
}

export function hasAuthorSuppliedName(element: Element): boolean {
  return Boolean(
    element.getAttribute("aria-label")?.trim() || element.getAttribute("aria-labelledby")?.trim(),
  );
}

export function expectNameContainsVisibleText(
  element: HTMLElement,
  role: ByRoleMatcher = "button",
): void {
  const accessibleName = getAccessibleName(element, role);
  if (!hasAuthorSuppliedName(element)) return;
  const visibleText = getVisibleText(element);
  expect(
    isLabelInName(visibleText, accessibleName),
    `accessible name "${accessibleName}" does not contain visible text "${visibleText}"`,
  ).toBe(true);
}

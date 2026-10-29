# accessible-names Specification

## Purpose

Defines how interactive elements in the web app expose accessible names relative to their visible text, so that speech-input and screen-reader users can address a control by the words they see (WCAG 2.5.3 Label in Name).

## Requirements

### Requirement: Accessible name contains the visible text
Every interactive element that renders visible text and also has an author-supplied accessible name (`aria-label` or `aria-labelledby`) SHALL have an accessible name that contains all of its visible text as a contiguous word sequence, in the same order. Case, punctuation and parenthesised text are ignored in the comparison.

#### Scenario: LOD toggle in detail mode
- **WHEN** the topology toolbar shows the LOD toggle with visible text "LOD: Detail"
- **THEN** the button's accessible name contains "LOD: Detail"

#### Scenario: LOD toggle in grouped mode
- **WHEN** the user activates the LOD toggle and its visible text becomes "LOD: Grouped"
- **THEN** the button's accessible name contains "LOD: Grouped" and no longer contains "LOD: Detail"

#### Scenario: Node card with metrics
- **WHEN** a node card renders its label, optional sublabel and metrics strip (for example "orders-svc", "RPS 1.2k", "p99 45ms", "Sat 30%")
- **THEN** the card's accessible name contains that visible text in the order it is displayed

#### Scenario: Edge RPS pill
- **WHEN** an edge with non-zero traffic shows an RPS pill such as "1.2k rps"
- **THEN** the pill button's accessible name contains "1.2k rps" exactly as formatted on screen

#### Scenario: Group expand/collapse button
- **WHEN** a service group shows its expand/collapse button with visible text such as "4 nodes"
- **THEN** the button's accessible name contains "4 nodes"

#### Scenario: Evidence chip with a node kind
- **WHEN** an evidence chip shows a node kind and label (for example "service orders-svc")
- **THEN** the chip's accessible name contains "service orders-svc"

### Requirement: Visible text leads the accessible name
When an element's accessible name adds context beyond its visible text, the name SHALL start with the visible text and the extra context SHALL follow it, or the extra context SHALL be exposed as an accessible description instead.

#### Scenario: Extra context follows the visible text
- **WHEN** the LOD toggle shows "LOD: Detail"
- **THEN** its accessible name starts with "LOD: Detail" and may continue with a description of the action, such as "toggle level of detail grouping"

#### Scenario: Health and topology context stays available
- **WHEN** a screen reader focuses a node card
- **THEN** the node's health and its upstream and downstream counts are announced, either in the accessible name after the visible text or in the accessible description

### Requirement: Visible text is not hidden from assistive technology
Visible text inside an interactive element SHALL NOT be removed from the accessibility tree (for example with `aria-hidden`) as a way to satisfy the label-in-name check.

#### Scenario: Metrics remain exposed
- **WHEN** a node card's metrics strip is visible
- **THEN** the metric labels and values are not marked `aria-hidden`

### Requirement: Label-in-name is enforced by automated checks
The end-to-end accessibility scans SHALL run axe-core 4.14.0 or later with the `label-content-name-mismatch` rule enabled, and component tests SHALL fail when an element covered by this spec has an accessible name that does not contain its visible text.

#### Scenario: E2E scan reports no label-in-name violations
- **WHEN** the E2E axe scans run on `/topology` and in the chaos-scenario journey
- **THEN** they report zero `label-content-name-mismatch` violations, without the rule being disabled or excluded

#### Scenario: Component test catches a regression
- **WHEN** an element covered by this spec is changed so its accessible name no longer contains its visible text
- **THEN** at least one component test fails

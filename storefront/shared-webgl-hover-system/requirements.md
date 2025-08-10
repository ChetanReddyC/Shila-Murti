# Requirements Document

## Introduction

This initiative replaces per-card WebGL canvases with a single shared overlay WebGL context that renders the exact same hover effect for any product card, regardless of how many products are listed. The goals are to eliminate WebGL context limits, prevent GPU/CPU overload, and guarantee consistent visuals and responsiveness at scale.

## Requirements

### Requirement 1: Single Shared WebGL Context

**User Story:** As a user, I expect the hover effect to work reliably no matter how many products are on the page.

#### Acceptance Criteria

1. The page SHALL use exactly one WebGL context for the grid (WebGL1 preferred; WebGL2 optional when available).
2. The overlay canvas SHALL be positioned over the hovered card only, sized to its bounding box.
3. When no card is hovered, the overlay SHALL draw nothing and consume near-zero CPU.

### Requirement 2: Exact Visual Parity of Effect

**User Story:** As a designer, I want the new implementation to match the existing hover effect exactly.

#### Acceptance Criteria

1. The fragment/vertex shaders SHALL be the same sources currently used (`shaderSources.ts` and `edgeGradientShaderSources.ts`) or a visually identical merge.
2. Uniforms (`u_time`, `u_res`, `u_intensity`, `u_mouse`) SHALL behave identically to the current per-card implementation.
3. The effect SHALL respect device pixel ratio and product card aspect without distortion.

### Requirement 3: Lifecycle and Cleanup Guarantees

**User Story:** As an engineer, I need the system to aggressively clean up on hover-out to be ready for the next hover instantly.

#### Acceptance Criteria

1. On hover-in: start RAF if not running; ramp intensity to target; set card bounds and uniforms.
2. On hover-out: fade to neutral, draw a final clear frame, then stop scheduling frames until needed again.
3. No growth of GPU resources over time; program/buffers are created once and reused; no leaks between hovers.

### Requirement 4: Performance and Scale

**User Story:** As a user, I want a smooth interaction even on pages with many products.

#### Acceptance Criteria

1. Idle CPU overhead of the overlay SHALL be negligible (<0.5% of a core when no hover).
2. First-hover stutter SHALL be minimized via a prewarm step (compile/link done ahead of interaction).
3. Resize and scroll updates SHALL be handled without visible jitter; pointer tracking SHALL be per-frame accurate.

### Requirement 5: Robustness and Recovery

**User Story:** As a user, I expect the effect to work across devices and recover from failures.

#### Acceptance Criteria

1. The overlay SHALL listen for `webglcontextlost` and `webglcontextrestored` and recover automatically.
2. If context creation fails, the system SHALL disable the effect with no layout shifts or console spam.
3. The system SHALL tolerate varying product counts, image sizes, and DPI without visual regressions.

### Requirement 6: Integration and UX

**User Story:** As a developer, I want a clean integration with the existing grid and cards.

#### Acceptance Criteria

1. The overlay SHALL mount once at the grid level and expose an imperative API: `beginHover(cardEl)`, `updatePointer(x,y)`, `endHover()`.
2. Product cards SHALL only forward hover events and bounding boxes; they SHALL NOT create any WebGL contexts.
3. Z-index and stacking contexts SHALL ensure the overlay appears above the hovered card visuals but below any global UI.

### Requirement 7: Observability

**User Story:** As a maintainer, I want concise logs to diagnose issues quickly.

#### Acceptance Criteria

1. Minimal, structured logs during init and context loss/restoration.
2. Optional debug flag to log bounds, DPI, and uniform updates.



# Implementation Plan

- [x] 1. Introduce Overlay Skeleton and API

  - Create `HoverEffectOverlay` component with a canvas absolutely positioned over the grid container; `pointer-events: none`.
  - Define and export `HoverOverlayAPI` via `forwardRef` so cards can call `beginHover`, `updatePointer`, and `endHover`.

- [x] 2. WebGL Initialization (One-time)

  - In overlay mount: create WebGL context, compile/link shaders (mirror existing sources), create quad buffer, cache uniform/attrib locations.
  - Add DPR-aware sizing utilities; add context lost/restored listeners.

- [x] 3. Render Loop and Uniforms

  - Implement RAF loop that runs only when active or during fade out.
  - Maintain `u_time`, `u_res`, `u_intensity` easing, and `u_mouse` in pixels; normalize in shader as needed.
  - Clear frame when idle; no draw calls when intensity ~0.

- [x] 4. Positioning and Sizing per Hover

  - On `beginHover(cardEl)`: compute container-local rect; set canvas style/size, internal resolution (DPR), and update `u_res`.
  - On `updatePointer(clientX, clientY)`: convert to canvas-local pixel coords; update `u_mouse`.
  - On `endHover()`: ease intensity to 0; stop RAF when settled and clear.

- [X] 5. Integrate with `ProductsGrid` and Cards

  - Mount overlay once inside products page/grid container and keep a ref.
  - Update `ProductCardWithShader` to remove `ShaderCanvas` and `EdgeGradientShaderCanvas`.
  - Wire card hover events to call overlay API with its element ref and pointer positions.

- [x] 6. Prewarm Step

  - On overlay mount (idle), run a tiny compile+first frame to avoid first-hover jank; keep intensity at 0.

- [x] 7. Observability and Debug Flag

  - Add optional minimal logs (init success, lost/restored, active card id, DPR, sizes) behind a flag.

- [x] 8. Manual QA and Regression Checks

  - Verify identical visuals vs current implementation.
  - Confirm only one WebGL context exists and no resource growth over many hovers.
  - Test on different DPRs and browsers; test context loss.




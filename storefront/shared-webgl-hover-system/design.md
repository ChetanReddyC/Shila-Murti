# Design Document

## Overview

We replace N per-card WebGL canvases with a single overlay WebGL renderer placed at the grid level. The overlay positions itself over the currently hovered product card, reuses a single program and buffers, and renders the exact same effect. This avoids exceeding browser WebGL context limits and reduces CPU/GPU load dramatically while preserving visuals.

## Architecture

### Components and Modules

- `HoverEffectOverlay` (new):
  - A React component mounted once within the products page/grid container.
  - Owns one `<canvas>` and one WebGL context.
  - Precompiles shaders; manages RAF; handles pointer and resize.
  - Exposes imperative API to begin/update/end a hover session.

- `useHoverOverlayController` (new hook):
  - Provides a ref-based controller to product cards to register hover-in/out and pointer moves.
  - Translates DOM events to overlay API calls and computes card bounds.

- `ProductCardWithShader` (existing):
  - Removes per-card `ShaderCanvas` and `EdgeGradientShaderCanvas`.
  - On hover: calls controller.begin, controller.update, controller.end.

### Data Flow

1. Page mounts `HoverEffectOverlay` with a ref: `overlayRef`.
2. Each card gets a `controller` (closure) which calls into `overlayRef.current` methods with its DOM rect and pointer.
3. Overlay updates internal state: canvas position/size, uniforms, intensity; starts/stops RAF as needed.

### WebGL Pipeline

- Context: `canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: false })`.
- Geometry: static full-screen quad (two triangles) in NDC; no per-hover reallocation.
- Shaders: reuse current `vertexShaderSource` and either:
  - Option 1: draw effect A and B sequentially into the default framebuffer with blending; or
  - Option 2: merge effects into one fragment shader with a mode flag.
- Uniforms:
  - `u_time`: seconds since overlay init.
  - `u_res`: canvas pixel size (accounting for DPR).
  - `u_intensity`: eased toward 1 on hover-in, toward 0 on hover-out.
  - `u_mouse`: pointer in pixel coords; shader normalizes as needed.

### Positioning and DPI

- Canvas is absolutely positioned inside the grid container, with `pointer-events: none`.
- On hover-in/end or pointer-move, compute target card’s `getBoundingClientRect()` and convert to container-local coordinates.
- Device pixel ratio handled by setting `canvas.width/height = cssSize * dpr` and `style.width/height = cssSize`.

### Lifecycle

- Init: create context, compile/link once, create buffers, set state idle.
- Hover-in(cardEl):
  - Compute rect; set canvas style/size; set `active = true`; start RAF if stopped; ease `u_intensity` → 1.
- Pointer-move(x, y):
  - Update `u_mouse`; overlay will sample per frame.
- Hover-out():
  - Ease `u_intensity` → 0; once below threshold, stop RAF; clear canvas.
- Unmount: cancel RAF; delete buffers/program; optionally call `loseContext` extension.

### Error Handling & Recovery

- Listen for `webglcontextlost` to pause drawing and for `webglcontextrestored` to reinitialize resources.
- If context creation or shader compilation fails, render nothing but keep layout stable; expose a debug flag.

## Interfaces

```ts
export interface HoverOverlayAPI {
  beginHover(cardElement: HTMLElement): void;
  updatePointer(clientX: number, clientY: number): void;
  endHover(): void;
}
```

`HoverEffectOverlay` exposes `ref.current: HoverOverlayAPI | null`.

## Performance Considerations

- Single context; bounded resource counts.
- RAF runs only while `active` or while easing to neutral.
- Use `requestAnimationFrame` and avoid timers.
- Avoid per-frame allocations. Preallocate buffers/uniform locations once.

## Testing Scope

- Visual parity against current implementation on multiple DPRs.
- No context creation beyond one for the page.
- Repeated hover-in/out cycles without resource growth.
- Context loss and restore recovery.



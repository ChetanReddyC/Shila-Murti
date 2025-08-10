# Category-Based Filtering - Design Document

## Overview
Enable users to filter products by categories (e.g., Deities, Animals, Abstract, Marble, Granite) directly on the Products page. Filtering is performed server-side through Medusa v2 Store routes, using `category_id[]` query parameters. The UX remains fast, resilient, accessible, and consistent with the existing sorting and loading/error states.

## Goals
- First-class, server-side filtering using Product Categories
- Seamless UX with pill controls, instant feedback, and memoized rendering
- Reuse existing `productsService` caching, retry logic, and performance logging
- Optional URL deep-linking for shareable filter states

## Non-goals
- Building new backend routes (use Store API only)
- Using product Tags for storefront filtering (keep them for internal organization if desired)

## Data Model
- Canonical filter: Product Categories (supports hierarchies in Medusa v2)
- Example category set matching current UI pills:
  - Theme: Deities, Animals, Abstract
  - Material: Marble, Granite
- Mapping strategy:
  - Maintain a small config map of `uiCategoryKey -> category_id` (or `category_handle`)
  - If only handles are known, resolve to IDs at app start or on first use and cache

## API Surfaces
- `medusaApiClient.getProducts(params: ProductQueryParams)` supports:
  - `limit`, `offset`, `region_id`, `sales_channel_id`, `category_id[]`
- On selection, translate chosen pills → `category_id[]` and call `getProducts`
- Avoid client-side filtering for accuracy and performance

## Service Layer
- `productsService.fetchProducts(params)` already accepts `ProductQueryParams`
- Ensure `generateCacheKey` includes a stable, sorted `category_id[]` so each combination is cached distinctly
- Keep retry/backoff and region discovery unchanged

## UI/UX
- Pill controls mirror existing style; selection state clearly indicated
- Multi-select across category pills; default (no selection) shows all products
- On selection change:
  - Update selected categories state
  - Compute `category_id[]` via the mapping
  - Debounced fetch (~150–250 ms)
  - Show skeletons while loading; preserve layout stability
  - Reuse `ErrorState`/`EmptyState`
- Optional: Sync selected categories to URL as `?categories=abstract,marble` (resolve handles → ids on load)

## Accessibility
- Pills: role="button", keyboard focus, Space/Enter toggle, `aria-pressed` for selected
- Announce updates via polite live region (e.g., "12 products loaded")
- Maintain color contrast and hit area ≥ 44×44 px equivalent

## Performance
- Server-side filtering + client-side caching (service-level TTL)
- Debounce requests on rapid toggling
- Memoize derived props and keep stable refs to avoid unnecessary re-renders

## Observability
- Log selected categories and fetch timings (reuse `performanceMonitor`)
- Console diagnostics in development, similar to checkout

## Edge Cases & Fallbacks
- No matching products → show `EmptyState` with "Clear filters"
- Unknown category IDs at startup → resolve handles → ids and cache; warn if missing
- Network errors → preserve selection, allow retries

## Open Decisions
- Multi-select semantics: OR across all selected categories initially; later consider AND across groups
- URL sync default: on or off (recommended: on)

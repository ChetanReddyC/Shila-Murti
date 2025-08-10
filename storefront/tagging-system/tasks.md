# Category Filtering - Comprehensive Action Plan

## 1) Data & Admin Setup
- Define the categories you want to expose as pills (e.g., Deities, Animals, Abstract, Marble, Granite)
- In Medusa Admin: Catalog → Categories → Create categories (or use existing)
- Capture each category's `id` (or handle) for the frontend mapping

## 2) API & Types
- Keep using `ProductQueryParams` with `category_id[]`
- If needed later, add an optional `collection_id` support (not required now)

## 3) Service Layer
- Ensure `productsService.fetchProducts({ category_id })` gets ids in a stable sorted array and includes them in the cache key
- Add concise logging of selected categories and fetch times (development only)
- Reuse retry/backoff and region resolution as-is

## 4) UI State & URL
- Add `selectedCategories: Set<UiCategoryKey>` to the products page
- Derive `category_id[]` in a memo from the set + mapping
- Debounce fetch (150–250 ms) on selection changes
- Optional URL params: `categories` (handles) and `sort` for deep-links

## 5) Components & Styling
- Reuse existing pills; add selected style and `aria-pressed`
- Add a polite live region (e.g., visually hidden) to announce product counts after loads

## 6) Integration Flow
- Toggle pill → update `selectedCategories` → map to `category_id[]` → fetch via productsService → render grid
- Sort remains client-side and is applied post-fetch
- Maintain current loading, error, and empty states

## 7) Observability & QA
- Diagnostics: log selected categories and fetch latency in dev
- Manual QA: multi-select, no results, retry, URL share/open, back/forward
- Performance QA: rapid toggles (debounce), cache hit behavior

## 8) Deliverables
- Mapping file for UI keys → `category_id` (or handle resolver)
- Products page edits to wire selection → fetch → render
- Documentation updates in `storefront/tagging-system/`

## 9) Risks & Mitigations
- Missing category ids: resolve handles → ids once and cache; provide fallback message if unresolved
- Excess API calls during rapid toggles: debounce + caching + retry/backoff already present
- UX complexity: keep first version simple (OR across selected categories)

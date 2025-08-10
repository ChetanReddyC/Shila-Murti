# Category Selection - UX & Interaction

## Pill Controls
- Visual style: match existing pill theme; selected state emphasizes contrast and subtle elevation
- Interaction:
  - Click/tap toggles selection
  - Keyboard: Tab for focus, Space/Enter toggles, Escape blurs
  - ARIA: role="button", aria-pressed for selected
- Multi-select allowed across all category pills; empty selection = all products

## Behavior
- On toggle:
  - Update local `selectedCategories` state (set of UI keys)
  - Map to `category_id[]` using a config map (or resolve handles → ids)
  - Debounced fetch (150–250 ms) via `productsService.fetchProducts({ category_id })`
  - Show skeletons while loading; preserve layout
  - Update Empty/Error states as needed
- Sorting coexists: current sort option is applied to fetched results on the client

## Accessibility
- Focus outlines visible; hit area ≥ 44×44 px equivalent
- Announce product count changes via polite live region
- Maintain color contrast for selected and hovered states

## URL Sync (optional)
- Encode selected categories as `?categories=abstract,marble` (handles)
- On initial load, resolve handles → ids and set `selectedCategories`
- Keep sort in URL as `?sort=price-asc` for shareable state

## Edge Handling
- If some category ids are missing at boot, resolve on demand and cache, warn in console if unresolved
- "Clear filters" resets to default (no categories)
- Preserve selection while retrying on transient errors

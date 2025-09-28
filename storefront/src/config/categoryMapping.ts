/**
 * Category mapping and resolution utilities
 *
 * Fill in either the category IDs directly, or the handles that exist in Medusa Admin → Catalog → Categories.
 * If IDs are not provided, the resolver will attempt to fetch categories by handle
 * using the public Store API via `medusaApiClient`.
 */

// Allow known UI keys and also arbitrary handles (for "More" menu)
export type UiCategoryKey =
  | 'deities'
  | 'animals'
  | 'abstract'
  | 'marble'
  | 'granite'
  | (string & {});

/**
 * Optional direct ID mapping (preferred if you know the IDs).
 * Example value format: 'pcat_01HXXXXXXX' (Medusa product category id)
 */
export const categoryIdByUiKey: Partial<Record<UiCategoryKey, string>> = {
  // deities: 'pcat_...',
  // animals: 'pcat_...',
  // abstract: 'pcat_...',
  // marble: 'pcat_...',
  // granite: 'pcat_...',
};

/**
 * Handle mapping (fallback when IDs are not provided).
 * Ensure these handles match the Category handles configured in Medusa Admin.
 */
export const categoryHandleByUiKey: Record<UiCategoryKey, string> = {
  deities: 'deities',
  animals: 'animals',
  abstract: 'abstract-arts',
  marble: 'marble',
  granite: 'granite',
};

/**
 * Simple in-memory cache for handle→id resolutions to avoid repeated lookups.
 */
const handleToIdCache = new Map<string, string>();

export interface ProductCategoryLite {
  id: string;
  handle?: string | null;
  name?: string | null;
}

export interface ProductCategoryFetcher {
  getProductCategories: (params?: { limit?: number; offset?: number; handle?: string }) => Promise<{
    product_categories?: ProductCategoryLite[];
    count?: number;
    [key: string]: unknown;
  }>;
}

/**
 * Resolves category IDs for a set of UI keys. Prefers direct IDs; otherwise resolves by handle once and caches.
 */
export async function resolveCategoryIdsByUiKeys(
  uiKeys: Set<UiCategoryKey>,
  apiClient: ProductCategoryFetcher
): Promise<string[]> {
  const ids: string[] = [];

  for (const key of uiKeys) {
    const directId = categoryIdByUiKey[key as UiCategoryKey];
    if (directId) {
      ids.push(directId);
      continue;
    }

    const mappedHandle = categoryHandleByUiKey[key as keyof typeof categoryHandleByUiKey];
    const handle = mappedHandle || String(key);
    if (!handle) continue;

    const cached = handleToIdCache.get(handle);
    if (cached) {
      ids.push(cached);
      continue;
    }

    // Try resolving by handle via the Store API.
    try {
      const response = await apiClient.getProductCategories({ limit: 100, handle });
      const list: ProductCategoryLite[] =
        (response as any).product_categories || (response as any).categories || [];

      // Prefer exact handle match; else fallback to name match
      const match = list.find(
        (c) => (c.handle && c.handle.toLowerCase() === handle.toLowerCase()) ||
               (c.name && c.name.toLowerCase() === handle.toLowerCase())
      );
      if (match?.id) {
        handleToIdCache.set(handle, match.id);
        ids.push(match.id);
      }
    } catch (err) {
      // Non-fatal: leave unresolved; caller can decide behavior
      // eslint-disable-next-line no-console
    }
  }

  // Return unique, stable-sorted ids
  return Array.from(new Set(ids)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}



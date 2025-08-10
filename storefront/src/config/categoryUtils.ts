import type { UiCategoryKey } from './categoryMapping';

export function shouldShowMissingCategoryNotice(selected: Set<UiCategoryKey>, resolvedIds: string[]): boolean {
  return selected.size > 0 && resolvedIds.length === 0;
}



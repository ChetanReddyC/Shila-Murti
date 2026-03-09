/** Thin wrapper around window.location.assign — extracted for testability in JSDOM. */
export function redirectTo(url: string) { window.location.assign(url) }

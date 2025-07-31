/**
 * Utility functions for generating and working with product handles
 */

/**
 * Generates a URL-safe handle from a product title
 * @param title - The product title
 * @returns A URL-safe handle string
 */
export function generateProductHandle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Converts a handle back to a more readable format (for display purposes)
 * @param handle - The URL handle
 * @returns A more readable string
 */
export function handleToTitle(handle: string): string {
  return handle
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Validates if a handle is properly formatted
 * @param handle - The handle to validate
 * @returns True if the handle is valid
 */
export function isValidHandle(handle: string): boolean {
  // Handle should only contain lowercase letters, numbers, and hyphens
  // Should not start or end with hyphen
  const handleRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  return handleRegex.test(handle);
}
/**
 * Utility for formatting currency values with proper locale support
 */

export interface CurrencyFormatterOptions {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

export class CurrencyFormatter {
  private static readonly DEFAULT_LOCALE = 'en-US';
  private static readonly CURRENCY_LOCALES: Record<string, string> = {
    'INR': 'en-IN',
    'USD': 'en-US',
    'EUR': 'en-GB',
    'GBP': 'en-GB',
    'CAD': 'en-CA',
    'AUD': 'en-AU',
  };

  /**
   * Format a price with the appropriate currency and locale
   */
  static formatPrice(
    amount: number, 
    currencyCode: string = 'USD', 
    options: CurrencyFormatterOptions = {}
  ): string {
    const {
      locale = this.CURRENCY_LOCALES[currencyCode.toUpperCase()] || this.DEFAULT_LOCALE,
      minimumFractionDigits = 2,
      maximumFractionDigits = 2,
    } = options;

    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currencyCode.toUpperCase(),
        minimumFractionDigits,
        maximumFractionDigits,
      }).format(amount);
    } catch (error) {
      // Fallback for unsupported currencies
      console.warn(`Unsupported currency: ${currencyCode}, falling back to USD`);
      return new Intl.NumberFormat(this.DEFAULT_LOCALE, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits,
        maximumFractionDigits,
      }).format(amount);
    }
  }

  /**
   * Get the appropriate locale for a currency
   */
  static getLocaleForCurrency(currencyCode: string): string {
    return this.CURRENCY_LOCALES[currencyCode.toUpperCase()] || this.DEFAULT_LOCALE;
  }

  /**
   * Check if a currency is supported by the browser
   */
  static isCurrencySupported(currencyCode: string): boolean {
    try {
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode.toUpperCase(),
      }).format(100);
      return true;
    } catch {
      return false;
    }
  }
}
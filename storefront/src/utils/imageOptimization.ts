/**
 * Image optimization utilities for handling lazy loading, placeholders, and error handling
 */

export interface ImageLoadOptions {
  src: string;
  fallbackSrc?: string;
  placeholder?: string;
  sizes?: string;
  quality?: number;
  priority?: boolean;
}

export interface ImageLoadResult {
  src: string;
  loaded: boolean;
  error: boolean;
  placeholder: boolean;
}

export class ImageOptimizer {
  private static readonly DEFAULT_PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDQwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xNzUgMTI1SDE4NVYxMzVIMTc1VjEyNVoiIGZpbGw9IiM5Q0EzQUYiLz4KPHBhdGggZD0iTTE5NSAxMjVIMjI1VjEzNUgxOTVWMTI1WiIgZmlsbD0iIzlDQTNBRiIvPgo8cGF0aCBkPSJNMTc1IDEzNUgxODVWMTQ1SDE3NVYxMzVaIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0xOTUgMTM1SDIyNVYxNDVIMTk1VjEzNVoiIGZpbGw9IiM5Q0EzQUYiLz4KPHBhdGggZD0iTTE3NSAxNDVIMTg1VjE1NUgxNzVWMTQ1WiIgZmlsbD0iIzlDQTNBRiIvPgo8cGF0aCBkPSJNMTk1IDE0NUgyMjVWMTU1SDE5NVYxNDVaIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0xNzUgMTU1SDE4NVYxNjVIMTc1VjE1NVoiIGZpbGw9IiM5Q0EzQUYiLz4KPHBhdGggZD0iTTE5NSAxNTVIMjI1VjE2NUgxOTVWMTU1WiIgZmlsbD0iIzlDQTNBRiIvPgo8L3N2Zz4K';
  private static readonly DEFAULT_FALLBACK = '/images/placeholder-product.jpg';
  private static readonly SUPPORTED_FORMATS = ['webp', 'avif', 'jpg', 'jpeg', 'png'];
  
  /**
   * Generates optimized image URLs with proper sizing and format
   */
  static optimizeImageUrl(src: string, options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: string;
  } = {}): string {
    if (!src || src.startsWith('data:')) {
      return src;
    }

    // If it's already a data URL or blob, return as is
    if (src.startsWith('blob:') || src.startsWith('data:')) {
      return src;
    }

    // For external URLs, return as is (could be enhanced with image proxy)
    if (src.startsWith('http://') || src.startsWith('https://')) {
      return src;
    }

    // For local images, we could add Next.js Image optimization parameters
    // This is a placeholder for future enhancement
    return src;
  }

  /**
   * Detects browser support for modern image formats
   */
  static detectImageFormatSupport(): Promise<{
    webp: boolean;
    avif: boolean;
  }> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      
      const webpSupport = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
      
      // AVIF detection is more complex, simplified for now
      const avifSupport = false; // Could be enhanced with proper detection
      
      resolve({ webp: webpSupport, avif: avifSupport });
    });
  }

  /**
   * Generates a placeholder image based on dimensions
   */
  static generatePlaceholder(width: number = 400, height: number = 300, color: string = '#F3F4F6'): string {
    const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="${color}"/>
        <g opacity="0.5">
          <rect x="${width/2 - 20}" y="${height/2 - 15}" width="10" height="10" fill="#9CA3AF"/>
          <rect x="${width/2 - 5}" y="${height/2 - 15}" width="25" height="10" fill="#9CA3AF"/>
          <rect x="${width/2 - 20}" y="${height/2 - 5}" width="10" height="10" fill="#9CA3AF"/>
          <rect x="${width/2 - 5}" y="${height/2 - 5}" width="25" height="10" fill="#9CA3AF"/>
          <rect x="${width/2 - 20}" y="${height/2 + 5}" width="10" height="10" fill="#9CA3AF"/>
          <rect x="${width/2 - 5}" y="${height/2 + 5}" width="25" height="10" fill="#9CA3AF"/>
        </g>
      </svg>
    `;
    
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  /**
   * Preloads an image and returns a promise
   */
  static preloadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      
      img.src = src;
    });
  }

  /**
   * Gets the optimal image format based on browser support
   */
  static async getOptimalFormat(originalSrc: string): Promise<string> {
    const support = await this.detectImageFormatSupport();
    
    // If the source already has a modern format, keep it
    if (originalSrc.includes('.webp') || originalSrc.includes('.avif')) {
      return originalSrc;
    }

    // For now, return original. Could be enhanced to convert formats
    return originalSrc;
  }

  /**
   * Calculates responsive image sizes based on container
   */
  static calculateResponsiveSizes(containerWidth: number): string {
    if (containerWidth <= 640) {
      return '(max-width: 640px) 100vw';
    } else if (containerWidth <= 768) {
      return '(max-width: 768px) 50vw';
    } else if (containerWidth <= 1024) {
      return '(max-width: 1024px) 33vw';
    } else {
      return '(max-width: 1200px) 25vw, 300px';
    }
  }

  /**
   * Creates a blur placeholder from an image
   */
  static createBlurPlaceholder(src: string, quality: number = 10): Promise<string> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Set small canvas size for blur effect
        canvas.width = quality;
        canvas.height = (img.height / img.width) * quality;
        
        if (ctx) {
          ctx.filter = 'blur(2px)';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.1));
        } else {
          resolve(this.DEFAULT_PLACEHOLDER);
        }
      };
      
      img.onerror = () => resolve(this.DEFAULT_PLACEHOLDER);
      img.src = src;
    });
  }
}

/**
 * Image loading states for UI components
 */
export enum ImageLoadState {
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error',
  PLACEHOLDER = 'placeholder'
}

/**
 * Image error types for better error handling
 */
export enum ImageErrorType {
  NETWORK = 'network',
  NOT_FOUND = '404',
  FORBIDDEN = '403',
  SERVER_ERROR = '500',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown'
}

export interface ImageError {
  type: ImageErrorType;
  message: string;
  src: string;
  timestamp: number;
}
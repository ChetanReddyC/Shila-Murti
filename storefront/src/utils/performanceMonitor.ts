import React from 'react';

/**
 * Performance monitoring utility for tracking component render times,
 * API response times, and other performance metrics
 */

export interface ComponentPerformanceMetric {
  componentName: string;
  renderTime: number;
  timestamp: number;
  props?: any;
}

export interface ApiPerformanceMetric {
  endpoint: string;
  method: string;
  responseTime: number;
  timestamp: number;
  success: boolean;
  cacheHit?: boolean;
  retryCount?: number;
}

export interface PerformanceThresholds {
  slowRenderTime: number; // ms
  slowApiResponse: number; // ms
  maxMetricsToKeep: number;
}

class PerformanceMonitor {
  private componentMetrics: ComponentPerformanceMetric[] = [];
  private apiMetrics: ApiPerformanceMetric[] = [];
  private thresholds: PerformanceThresholds;
  private enabled: boolean;

  constructor(thresholds: Partial<PerformanceThresholds> = {}) {
    this.thresholds = {
      slowRenderTime: 16, // 16ms for 60fps
      slowApiResponse: 1000, // 1 second
      maxMetricsToKeep: 100,
      ...thresholds
    };
    this.enabled = process.env.NODE_ENV === 'development' || 
                   process.env.NEXT_PUBLIC_ENABLE_PERFORMANCE_MONITORING === 'true';
  }

  /**
   * Track component render performance
   */
  trackComponentRender(componentName: string, renderTime: number, props?: any): void {
    if (!this.enabled) return;

    const metric: ComponentPerformanceMetric = {
      componentName,
      renderTime,
      timestamp: Date.now(),
      props: this.sanitizeProps(props)
    };

    this.componentMetrics.push(metric);
    this.trimMetrics('component');

    // Log slow renders
    if (renderTime > this.thresholds.slowRenderTime) {
    }

    // Log render performance in development
    if (process.env.NODE_ENV === 'development') {
    }
  }

  /**
   * Track API performance
   */
  trackApiPerformance(metric: ApiPerformanceMetric): void {
    if (!this.enabled) return;

    this.apiMetrics.push(metric);
    this.trimMetrics('api');

    // Log slow API responses
    if (metric.responseTime > this.thresholds.slowApiResponse) {
    }

    // Log API performance in development
    if (process.env.NODE_ENV === 'development') {
      const cacheStatus = metric.cacheHit ? ' (cached)' : '';
      const retryStatus = metric.retryCount ? ` (${metric.retryCount} retries)` : '';
    }
  }

  /**
   * Get component performance statistics
   */
  getComponentStats(componentName?: string): {
    averageRenderTime: number;
    slowRenders: number;
    totalRenders: number;
    metrics: ComponentPerformanceMetric[];
  } {
    const relevantMetrics = componentName 
      ? this.componentMetrics.filter(m => m.componentName === componentName)
      : this.componentMetrics;

    const totalRenders = relevantMetrics.length;
    const slowRenders = relevantMetrics.filter(m => m.renderTime > this.thresholds.slowRenderTime).length;
    const averageRenderTime = totalRenders > 0 
      ? Math.round(relevantMetrics.reduce((sum, m) => sum + m.renderTime, 0) / totalRenders)
      : 0;

    return {
      averageRenderTime,
      slowRenders,
      totalRenders,
      metrics: [...relevantMetrics]
    };
  }

  /**
   * Get API performance statistics
   */
  getApiStats(endpoint?: string): {
    averageResponseTime: number;
    slowResponses: number;
    totalRequests: number;
    successRate: number;
    cacheHitRate: number;
    metrics: ApiPerformanceMetric[];
  } {
    const relevantMetrics = endpoint 
      ? this.apiMetrics.filter(m => m.endpoint === endpoint)
      : this.apiMetrics;

    const totalRequests = relevantMetrics.length;
    const slowResponses = relevantMetrics.filter(m => m.responseTime > this.thresholds.slowApiResponse).length;
    const successfulRequests = relevantMetrics.filter(m => m.success).length;
    const cacheHits = relevantMetrics.filter(m => m.cacheHit).length;
    
    const averageResponseTime = totalRequests > 0 
      ? Math.round(relevantMetrics.reduce((sum, m) => sum + m.responseTime, 0) / totalRequests)
      : 0;
    
    const successRate = totalRequests > 0 ? Math.round((successfulRequests / totalRequests) * 100) : 0;
    const cacheHitRate = totalRequests > 0 ? Math.round((cacheHits / totalRequests) * 100) : 0;

    return {
      averageResponseTime,
      slowResponses,
      totalRequests,
      successRate,
      cacheHitRate,
      metrics: [...relevantMetrics]
    };
  }

  /**
   * Get overall performance summary
   */
  getPerformanceSummary(): {
    components: ReturnType<typeof this.getComponentStats>;
    apis: ReturnType<typeof this.getApiStats>;
    recommendations: string[];
  } {
    const componentStats = this.getComponentStats();
    const apiStats = this.getApiStats();
    const recommendations: string[] = [];

    // Generate recommendations based on metrics
    if (componentStats.slowRenders > componentStats.totalRenders * 0.1) {
      recommendations.push('Consider optimizing component renders - high number of slow renders detected');
    }

    if (apiStats.slowResponses > apiStats.totalRequests * 0.2) {
      recommendations.push('Consider optimizing API calls - high number of slow responses detected');
    }

    if (apiStats.cacheHitRate < 30 && apiStats.totalRequests > 10) {
      recommendations.push('Consider improving caching strategy - low cache hit rate detected');
    }

    if (apiStats.successRate < 95 && apiStats.totalRequests > 5) {
      recommendations.push('Consider improving error handling - low API success rate detected');
    }

    return {
      components: componentStats,
      apis: apiStats,
      recommendations
    };
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.componentMetrics = [];
    this.apiMetrics = [];
  }

  /**
   * Enable or disable performance monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if performance monitoring is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  private sanitizeProps(props: any): any {
    if (!props) return undefined;
    
    // Remove functions and complex objects to prevent circular references
    const sanitized: any = {};
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'function') {
        sanitized[key] = '[Function]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = '[Object]';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private trimMetrics(type: 'component' | 'api'): void {
    if (type === 'component' && this.componentMetrics.length > this.thresholds.maxMetricsToKeep) {
      this.componentMetrics = this.componentMetrics.slice(-this.thresholds.maxMetricsToKeep);
    } else if (type === 'api' && this.apiMetrics.length > this.thresholds.maxMetricsToKeep) {
      this.apiMetrics = this.apiMetrics.slice(-this.thresholds.maxMetricsToKeep);
    }
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Export factory function for custom configurations
export const createPerformanceMonitor = (thresholds?: Partial<PerformanceThresholds>): PerformanceMonitor => {
  return new PerformanceMonitor(thresholds);
};

// React hook for tracking component render performance
export const useRenderPerformance = (componentName: string, props?: any) => {
  const startTime = performance.now();
  
  React.useEffect(() => {
    const endTime = performance.now();
    const renderTime = Math.round(endTime - startTime);
    performanceMonitor.trackComponentRender(componentName, renderTime, props);
  });
};

// Higher-order component for tracking render performance
export const withPerformanceTracking = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string
) => {
  const displayName = componentName || WrappedComponent.displayName || WrappedComponent.name || 'Component';
  
  const WithPerformanceTracking: React.FC<P> = (props) => {
    const startTime = performance.now();
    
    React.useEffect(() => {
      const endTime = performance.now();
      const renderTime = Math.round(endTime - startTime);
      performanceMonitor.trackComponentRender(displayName, renderTime, props);
    });
    
    return React.createElement(WrappedComponent, props);
  };
  
  WithPerformanceTracking.displayName = `withPerformanceTracking(${displayName})`;
  
  return WithPerformanceTracking;
};
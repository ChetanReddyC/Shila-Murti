/**
 * WebGL Context Manager
 * Manages WebGL contexts across the application to prevent hitting browser limits
 * and ensure proper context reuse
 */

interface ContextInfo {
  context: WebGLRenderingContext | null;
  canvas: HTMLCanvasElement;
  lastUsed: number;
  id: string;
}

class WebGLContextManager {
  private static instance: WebGLContextManager | null = null;
  private contexts: Map<string, ContextInfo> = new Map();
  private readonly MAX_CONTEXTS = 8; // Conservative limit (browsers typically support 8-16)
  
  private constructor() {}
  
  static getInstance(): WebGLContextManager {
    if (!WebGLContextManager.instance) {
      WebGLContextManager.instance = new WebGLContextManager();
    }
    return WebGLContextManager.instance;
  }
  
  /**
   * Get or create a WebGL context for a canvas
   * @param id Unique identifier for the context
   * @param canvas Canvas element
   * @param options WebGL context attributes
   * @returns WebGL rendering context or null
   */
  getContext(
    id: string,
    canvas: HTMLCanvasElement,
    options?: WebGLContextAttributes
  ): WebGLRenderingContext | null {
    // Check if context already exists and is still valid
    const existing = this.contexts.get(id);
    if (existing && existing.context && !existing.context.isContextLost()) {
      existing.lastUsed = Date.now();
      return existing.context;
    }
    
    // Check if we've hit the limit
    if (this.contexts.size >= this.MAX_CONTEXTS) {
      this.freeOldestContext();
    }
    
    // Create new context
    const defaultOptions: WebGLContextAttributes = {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      antialias: false,
      depth: false,
      stencil: false,
      ...options,
    };
    
    try {
      const gl = canvas.getContext('webgl', defaultOptions) as WebGLRenderingContext;
      
      if (!gl) {
        console.warn(`[WebGLContextManager] Failed to create context for ${id}`);
        return null;
      }
      
      const contextInfo: ContextInfo = {
        context: gl,
        canvas,
        lastUsed: Date.now(),
        id,
      };
      
      this.contexts.set(id, contextInfo);
      console.log(`[WebGLContextManager] Created context for ${id}. Total: ${this.contexts.size}/${this.MAX_CONTEXTS}`);
      
      return gl;
    } catch (error) {
      console.error(`[WebGLContextManager] Error creating context for ${id}:`, error);
      return null;
    }
  }
  
  /**
   * Release a context without forcing context loss
   * @param id Unique identifier for the context
   */
  releaseContext(id: string): void {
    const contextInfo = this.contexts.get(id);
    if (!contextInfo) return;
    
    const { context } = contextInfo;
    
    // Clean up WebGL resources but DON'T force context loss
    if (context && !context.isContextLost()) {
      // Get all created programs, shaders, buffers, etc. and delete them
      // Note: Individual components should handle their own resource cleanup
      console.log(`[WebGLContextManager] Released context for ${id}. Remaining: ${this.contexts.size - 1}`);
    }
    
    this.contexts.delete(id);
  }
  
  /**
   * Mark a context as recently used
   * @param id Unique identifier for the context
   */
  touchContext(id: string): void {
    const contextInfo = this.contexts.get(id);
    if (contextInfo) {
      contextInfo.lastUsed = Date.now();
    }
  }
  
  /**
   * Free the oldest unused context to make room for new ones
   */
  private freeOldestContext(): void {
    let oldestId: string | null = null;
    let oldestTime = Date.now();
    
    this.contexts.forEach((info, id) => {
      if (info.lastUsed < oldestTime) {
        oldestTime = info.lastUsed;
        oldestId = id;
      }
    });
    
    if (oldestId) {
      console.log(`[WebGLContextManager] Freeing oldest context: ${oldestId}`);
      this.releaseContext(oldestId);
    }
  }
  
  /**
   * Check if we can create more contexts
   */
  isContextAvailable(): boolean {
    return this.contexts.size < this.MAX_CONTEXTS;
  }
  
  /**
   * Get the number of active contexts
   */
  getActiveContextCount(): number {
    return this.contexts.size;
  }
  
  /**
   * Check if a specific context exists and is valid
   */
  hasValidContext(id: string): boolean {
    const contextInfo = this.contexts.get(id);
    return !!(contextInfo && contextInfo.context && !contextInfo.context.isContextLost());
  }
  
  /**
   * Clean up all contexts (use with caution)
   */
  disposeAll(): void {
    console.log(`[WebGLContextManager] Disposing all ${this.contexts.size} contexts`);
    this.contexts.forEach((_, id) => this.releaseContext(id));
    this.contexts.clear();
  }
}

// Export singleton instance getter
export const getWebGLContextManager = () => WebGLContextManager.getInstance();

// Export for convenience
export default WebGLContextManager;

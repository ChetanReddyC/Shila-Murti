/**
 * WebGL error handling and feature detection utilities
 * This module provides functions for handling WebGL errors and detecting WebGL features
 */

/**
 * Error types that can occur during WebGL initialization and usage
 */
export enum WebGLErrorType {
  CONTEXT_CREATION_FAILED = 'WebGL context creation failed',
  SHADER_COMPILATION_FAILED = 'Shader compilation failed',
  PROGRAM_LINKING_FAILED = 'Program linking failed',
  UNSUPPORTED_FEATURE = 'Unsupported WebGL feature',
  RESOURCE_CREATION_FAILED = 'WebGL resource creation failed',
  GENERAL_ERROR = 'WebGL general error'
}

/**
 * Interface for WebGL error information
 */
export interface WebGLErrorInfo {
  type: WebGLErrorType;
  message: string;
  originalError?: Error;
}

/**
 * Class for handling WebGL errors
 */
export class WebGLErrorHandler {
  private static errors: WebGLErrorInfo[] = [];
  private static errorListeners: ((error: WebGLErrorInfo) => void)[] = [];

  /**
   * Reports a WebGL error
   * @param type - The type of error
   * @param message - The error message
   * @param originalError - The original error object (if available)
   */
  public static reportError(
    type: WebGLErrorType,
    message: string,
    originalError?: Error
  ): void {
    const errorInfo: WebGLErrorInfo = {
      type,
      message,
      originalError
    };
    
    // Store the error
    this.errors.push(errorInfo);
    
    // Log the error to the console
    
    // Notify all error listeners
    this.errorListeners.forEach(listener => listener(errorInfo));
  }

  /**
   * Adds an error listener
   * @param listener - The error listener function
   */
  public static addErrorListener(listener: (error: WebGLErrorInfo) => void): void {
    this.errorListeners.push(listener);
  }

  /**
   * Removes an error listener
   * @param listener - The error listener function to remove
   */
  public static removeErrorListener(listener: (error: WebGLErrorInfo) => void): void {
    const index = this.errorListeners.indexOf(listener);
    if (index !== -1) {
      this.errorListeners.splice(index, 1);
    }
  }

  /**
   * Gets all reported errors
   * @returns Array of WebGL error information
   */
  public static getErrors(): WebGLErrorInfo[] {
    return [...this.errors];
  }

  /**
   * Clears all reported errors
   */
  public static clearErrors(): void {
    this.errors = [];
  }
}

/**
 * Checks if the browser supports WebGL
 * @returns An object with information about WebGL support
 */
export const checkWebGLSupport = (): { 
  supported: boolean; 
  version: 1 | 2 | 0;
  reason?: string;
} => {
  try {
    const canvas = document.createElement('canvas');
    
    // Try WebGL 2 first
    let gl: WebGL2RenderingContext | WebGLRenderingContext | null = canvas.getContext('webgl2');
    if (gl) {
      return { supported: true, version: 2 };
    }
    
    // Fall back to WebGL 1
    gl = (canvas.getContext('webgl') as WebGLRenderingContext | null) || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (gl) {
      return { supported: true, version: 1 };
    }
    
    // No WebGL support
    return { 
      supported: false, 
      version: 0,
      reason: 'WebGL is not supported by this browser'
    };
  } catch (error) {
    return { 
      supported: false, 
      version: 0,
      reason: `Error checking WebGL support: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

/**
 * Checks if specific WebGL extensions are supported
 * @param gl - The WebGL rendering context
 * @param extensions - Array of extension names to check
 * @returns An object mapping extension names to their support status
 */
export const checkWebGLExtensions = (
  gl: WebGLRenderingContext,
  extensions: string[]
): Record<string, boolean> => {
  const result: Record<string, boolean> = {};
  
  for (const extension of extensions) {
    try {
      const ext = gl.getExtension(extension);
      result[extension] = !!ext;
    } catch (error) {
      result[extension] = false;
      WebGLErrorHandler.reportError(
        WebGLErrorType.UNSUPPORTED_FEATURE,
        `Error checking extension ${extension}`,
        error instanceof Error ? error : undefined
      );
    }
  }
  
  return result;
};

/**
 * Gets information about the WebGL implementation
 * @param gl - The WebGL rendering context
 * @returns An object with information about the WebGL implementation
 */
export const getWebGLInfo = (gl: WebGLRenderingContext): {
  vendor: string;
  renderer: string;
  version: string;
  shadingLanguageVersion: string;
  maxTextureSize: number;
  maxTextureUnits: number;
} => {
  return {
    vendor: gl.getParameter(gl.VENDOR),
    renderer: gl.getParameter(gl.RENDERER),
    version: gl.getParameter(gl.VERSION),
    shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)
  };
};

/**
 * Checks if the browser supports the required WebGL features for the shader effect
 * @returns True if all required features are supported, false otherwise
 */
export const hasRequiredWebGLFeatures = (): boolean => {
  const support = checkWebGLSupport();
  
  if (!support.supported) {
    WebGLErrorHandler.reportError(
      WebGLErrorType.UNSUPPORTED_FEATURE,
      `WebGL is not supported: ${support.reason || 'Unknown reason'}`
    );
    return false;
  }
  
  // For our shader effect, WebGL 1 is sufficient
  return true;
};
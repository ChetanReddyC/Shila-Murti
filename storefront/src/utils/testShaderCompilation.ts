// Test utility to verify shader compilation works
import { createShader, createProgram } from './shaderUtils';
import { vertexShaderSource, fragmentShaderSource } from './shaderSources';
import { edgeGradientVertexShaderSource, edgeGradientFragmentShaderSource } from './edgeGradientShaderSources';

export function testShaderCompilation(): boolean {
  // Create a test canvas
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
  
  if (!gl) {
    return false;
  }

  try {
    // Test main shader
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    if (!vertexShader || !fragmentShader) {
      return false;
    }
    
    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) {
      return false;
    }
    
    
    // Test edge gradient shader
    const edgeVertexShader = createShader(gl, gl.VERTEX_SHADER, edgeGradientVertexShaderSource);
    const edgeFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, edgeGradientFragmentShaderSource);
    
    if (!edgeVertexShader || !edgeFragmentShader) {
      return false;
    }
    
    const edgeProgram = createProgram(gl, edgeVertexShader, edgeFragmentShader);
    if (!edgeProgram) {
      return false;
    }
    
    
    // Cleanup
    gl.deleteProgram(program);
    gl.deleteProgram(edgeProgram);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.deleteShader(edgeVertexShader);
    gl.deleteShader(edgeFragmentShader);
    
    return true;
    
  } catch (error) {
    return false;
  }
}

// Make it available in browser console for testing
if (typeof window !== 'undefined') {
  (window as any).testShaderCompilation = testShaderCompilation;
}
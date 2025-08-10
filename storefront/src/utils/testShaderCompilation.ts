// Test utility to verify shader compilation works
import { createShader, createProgram } from './shaderUtils';
import { vertexShaderSource, fragmentShaderSource } from './shaderSources';
import { edgeGradientVertexShaderSource, edgeGradientFragmentShaderSource } from './edgeGradientShaderSources';

export function testShaderCompilation(): boolean {
  // Create a test canvas
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
  
  if (!gl) {
    console.error('WebGL not supported');
    return false;
  }

  try {
    // Test main shader
    console.log('Testing main shader compilation...');
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    if (!vertexShader || !fragmentShader) {
      console.error('Main shader compilation failed');
      return false;
    }
    
    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) {
      console.error('Main shader program linking failed');
      return false;
    }
    
    console.log('Main shader compilation successful');
    
    // Test edge gradient shader
    console.log('Testing edge gradient shader compilation...');
    const edgeVertexShader = createShader(gl, gl.VERTEX_SHADER, edgeGradientVertexShaderSource);
    const edgeFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, edgeGradientFragmentShaderSource);
    
    if (!edgeVertexShader || !edgeFragmentShader) {
      console.error('Edge gradient shader compilation failed');
      return false;
    }
    
    const edgeProgram = createProgram(gl, edgeVertexShader, edgeFragmentShader);
    if (!edgeProgram) {
      console.error('Edge gradient shader program linking failed');
      return false;
    }
    
    console.log('Edge gradient shader compilation successful');
    
    // Cleanup
    gl.deleteProgram(program);
    gl.deleteProgram(edgeProgram);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    gl.deleteShader(edgeVertexShader);
    gl.deleteShader(edgeFragmentShader);
    
    console.log('All shader tests passed!');
    return true;
    
  } catch (error) {
    console.error('Shader test failed:', error);
    return false;
  }
}

// Make it available in browser console for testing
if (typeof window !== 'undefined') {
  (window as any).testShaderCompilation = testShaderCompilation;
}
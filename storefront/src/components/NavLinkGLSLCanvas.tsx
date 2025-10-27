'use client';

import { useRef, useEffect } from 'react';
import { getWebGLContextManager } from '@/utils/webglContextManager';

const vsSource = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const fsSource = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_res;
  uniform float u_hover_time;
  uniform float u_progress;

  // 2D noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for(int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = 2.0 * p + vec2(cos(u_time * 0.15), sin(u_time * 0.2));
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = v_uv;
    
    // Create a horizontal smoke effect that flows from left to right
    float flowTime = u_hover_time * 1.5;
    
    // Horizontal flow with slight upward drift
    vec2 flow = vec2(
      flowTime * 0.8,
      sin(flowTime * 2.0) * 0.15 - flowTime * 0.1
    );
    
    // Scale for tighter, more concentrated smoke
    vec2 smokeUV = (uv - 0.5) * vec2(3.0, 8.0) + flow;
    
    // Create swirling smoke pattern
    float angleNoise = fbm(smokeUV * vec2(1.5, 3.0));
    float swirlAngle = (angleNoise - 0.5) * 1.57; // Less rotation for underline
    mat2 rot = mat2(cos(swirlAngle), -sin(swirlAngle), sin(swirlAngle), cos(swirlAngle));
    vec2 p = rot * smokeUV;
    
    // Add subtle wave distortion
    p.y += sin(uv.x * 6.28 + flowTime * 3.0) * 0.2;
    p.x += cos(uv.y * 12.56 + flowTime * 2.0) * 0.1;
    
    // Compute smoke density
    float d = fbm(p * vec2(2.0, 4.0) + flow);
    
    // Shape the smoke to be thin like an underline
    float verticalMask = 1.0 - smoothstep(0.0, 0.3, abs(uv.y - 0.5) * 2.0);
    
    // Progress mask - smoke grows from left to right
    float progressMask = smoothstep(0.0, u_progress, uv.x);
    
    // Edge softness
    float edgeFade = smoothstep(0.0, 0.05, uv.x) * smoothstep(1.0, 0.95, uv.x);
    
    // Combine all masks
    float alpha = smoothstep(0.2, 0.6, d) * verticalMask * progressMask * edgeFade;
    
    // Add some intensity variation
    alpha *= 0.7 + 0.3 * sin(u_hover_time * 3.0 + uv.x * 5.0);
    
    // Smoke color - darker for better visibility
    vec3 smokeColor = vec3(0.1, 0.15, 0.2);
    
    gl_FragColor = vec4(smokeColor, alpha * 0.9);
  }
`;

interface NavLinkGLSLCanvasProps {
  isHovered: boolean;
  width?: number;
  height?: number;
}

const NavLinkGLSLCanvas = ({ isHovered, width = 100, height = 8 }: NavLinkGLSLCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverTimeRef = useRef<number>(0);
  const progressRef = useRef<number>(0);
  const isHoveredRef = useRef<boolean>(false);
  const hasBeenHoveredRef = useRef<boolean>(false);
  
  useEffect(() => {
    isHoveredRef.current = isHovered;
    if (isHovered) {
      hasBeenHoveredRef.current = true;
    }
    if (!isHovered) {
      hoverTimeRef.current = 0;
      progressRef.current = 0;
    }
  }, [isHovered]);
  
  // Only initialize WebGL context after first hover to save contexts
  useEffect(() => {
    if (!hasBeenHoveredRef.current) return; // Don't create context until first hover
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const contextManager = getWebGLContextManager();
    const contextId = 'navlink-glsl-canvas';
    
    const gl = contextManager.getContext(contextId, canvas, {
      alpha: true, 
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      antialias: false,
      depth: false,
      stencil: false
    });
    
    if (!gl) {
      console.warn('[NavLinkGLSLCanvas] Failed to get WebGL context');
      return;
    }
    
    // Handle context loss gracefully
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.warn('[NavLinkGLSLCanvas] WebGL context lost');
    };
    
    const handleContextRestored = () => {
      console.log('[NavLinkGLSLCanvas] WebGL context restored');
    };
    
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);
    
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(s));
      }
      return s;
    };

    const vs = compile(gl.VERTEX_SHADER, vsSource);
    const fs = compile(gl.FRAGMENT_SHADER, fsSource);

    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;

    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(prog));
      return;
    }
    
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uHoverTime = gl.getUniformLocation(prog, 'u_hover_time');
    const uProgress = gl.getUniformLocation(prog, 'u_progress');

    const start = performance.now();
    let animationFrameId: number;
    let lastFrameTime = performance.now();

    const render = () => {
      const now = performance.now();
      const deltaTime = (now - lastFrameTime) * 0.001;
      lastFrameTime = now;
      
      // Update hover time and progress
      if (isHoveredRef.current) {
        hoverTimeRef.current += deltaTime;
        // Smooth progress animation
        progressRef.current = Math.min(1, progressRef.current + deltaTime * 3.0);
      } else {
        // Fade out quickly when not hovered
        progressRef.current = Math.max(0, progressRef.current - deltaTime * 5.0);
      }
      
      // Only render if there's something to show
      if (progressRef.current > 0.001) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.uniform1f(uTime, (now - start) * 0.001);
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uHoverTime, hoverTimeRef.current);
        gl.uniform1f(uProgress, progressRef.current);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      
      // Clean up WebGL resources
      if (gl && !gl.isContextLost()) {
        gl.deleteProgram(prog);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        gl.deleteBuffer(buf);
      }
      
      // Note: We no longer force context loss - context manager handles lifecycle
      // This allows context reuse and prevents hitting browser limits
    };
  }, [width, height]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{
        position: 'absolute',
        bottom: '-4px',
        left: 0,
        width: '100%',
        height: `${height}px`,
        pointerEvents: 'none',
        opacity: isHovered ? 1 : 0,
        transition: 'opacity 0.3s ease'
      }}
    />
  );
};

export default NavLinkGLSLCanvas;

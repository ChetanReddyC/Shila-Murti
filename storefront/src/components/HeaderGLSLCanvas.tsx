'use client';

import { useRef, useEffect } from 'react';
import styles from './HeaderGLSLCanvas.module.css';
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
  uniform float u_interaction_time;
  uniform float u_direction;

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
    for(int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = 2.0 * p + vec2(cos(u_time * 0.2), sin(u_time * 0.3));
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // normalized coordinates
    vec2 uv = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
    
    // ZOOM EFFECT: Scale down UV to make smoke patterns bigger/closer
    uv *= 0.4;
    
    // Physics-based velocity: fast initial burst that decays to natural flow
    // Simulates smoke reacting to an object passing through it
    float t = u_interaction_time;
    
    // Exponential decay from fast (3.5) to slow (0.3) over ~2 seconds
    float velocityMultiplier = 0.3 + 3.2 * exp(-2.5 * t);
    
    // Ease-out cubic for smooth deceleration
    float easeOut = 1.0 - pow(1.0 - min(t / 1.5, 1.0), 3.0);
    
    // Combine exponential decay with ease-out for natural physics
    float physicsVelocity = mix(velocityMultiplier, 0.5, easeOut);
    
    float flowTime = t * physicsVelocity;
    
    // Natural flow based on interaction direction
    // u_direction: -1 = left, 1 = right
    vec2 accumulatedFlow = vec2(
      // Horizontal flow with physics-based velocity
      u_direction * flowTime * 1.8,
      // Upward drift also affected by physics
      -flowTime * 0.4
    );

    // Apply accumulated flow to move the smoke pattern
    vec2 flowingUV = uv * 1.5 + accumulatedFlow;
    
    // swirl field - using the FLOWING coordinates
    float angleNoise = fbm(flowingUV);
    float swirlAngle = (angleNoise - 0.5) * 3.1415;
    mat2 rot = mat2(cos(swirlAngle), -sin(swirlAngle), sin(swirlAngle), cos(swirlAngle));
    vec2 p = rot * uv;

    // layered sinusoidal distortion with physics-based turbulence
    // Initial chaos that settles into smooth flow
    float turbulence = velocityMultiplier * 0.15;
    p += vec2(
      sin((uv.y + flowTime) * 3.0) * (0.25 + turbulence) + u_direction * flowTime * 0.3,
      cos((uv.x + accumulatedFlow.x) * 3.0) * (0.2 + turbulence * 0.8)
    );

    // compute density using FLOWING coordinates
    float d = fbm(p * 1.3 + accumulatedFlow);
    d *= 0.7;
    float alpha = smoothstep(0.3, 0.6, d);

    // Only show on right 40% of header
    float rightMask = smoothstep(0.58, 0.62, v_uv.x);
    
    // Fade out after 4 seconds
    float fadeOut = 1.0 - smoothstep(3.5, 4.0, u_interaction_time);
    
    // Combine masks with fade out
    float final_mask = rightMask * alpha * fadeOut;

    // Smoke color
    vec3 fluid = vec3(0.15, 0.2, 0.25);
    gl_FragColor = vec4(fluid, final_mask * 0.8);
  }
`;

interface HeaderGLSLCanvasProps {
  isProfileMenuOpen: boolean;
}

const HeaderGLSLCanvas = ({ isProfileMenuOpen }: HeaderGLSLCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interactionTimeRef = useRef<number>(0);
  const directionRef = useRef<number>(1); // 1 = right, -1 = left
  const lastStateRef = useRef<boolean>(false);
  
  // Track interaction changes and reset timer
  useEffect(() => {
    if (isProfileMenuOpen !== lastStateRef.current) {
      interactionTimeRef.current = 0;
      directionRef.current = isProfileMenuOpen ? 1 : -1; // 1 for right (open), -1 for left (close)
      lastStateRef.current = isProfileMenuOpen;
    }
  }, [isProfileMenuOpen]);
  
  // Canvas WebGL setup and rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const contextManager = getWebGLContextManager();
    const contextId = 'header-glsl-canvas';
    
    const gl = contextManager.getContext(contextId, canvas, {
      alpha: true, 
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      antialias: false,
      depth: false,
      stencil: false
    });
    
    if (!gl) {
      console.warn('[HeaderGLSLCanvas] Failed to get WebGL context');
      return;
    }
    
    // Mark context as actively used
    contextManager.touchContext(contextId);
    
    // Handle context loss gracefully
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.warn('[HeaderGLSLCanvas] WebGL context lost');
    };
    
    const handleContextRestored = () => {
      console.log('[HeaderGLSLCanvas] WebGL context restored');
    };
    
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);
    
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    // Set canvas size based on viewport
    const updateCanvasSize = () => {
      const viewportWidth = window.innerWidth;
      // Header is 90% width at 1rem from top
      canvas.width = Math.floor(viewportWidth * 0.9);
      canvas.height = 65;
      console.log('Canvas size set:', canvas.width, 'x', canvas.height);
    };
    
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    
    // Also update on mount after a short delay
    setTimeout(() => {
      updateCanvasSize();
      console.log('Canvas positioned, parent:', canvas.parentElement?.className);
    }, 100);

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };

    const vs = compile(gl.VERTEX_SHADER, vsSource);
    const fs = compile(gl.FRAGMENT_SHADER, fsSource);

    if (!vs || !fs) {
      window.removeEventListener('resize', updateCanvasSize);
      return;
    }

    const prog = gl.createProgram();
    if (!prog) {
      window.removeEventListener('resize', updateCanvasSize);
      return;
    }

    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uInteractionTime = gl.getUniformLocation(prog, 'u_interaction_time');
    const uDirection = gl.getUniformLocation(prog, 'u_direction');

    const start = performance.now();
    let animationFrameId: number;
    let lastFrameTime = performance.now();

    const render = () => {
      const now = performance.now();
      const deltaTime = (now - lastFrameTime) * 0.001;
      lastFrameTime = now;
      
      // Update interaction time (capped at 4 seconds for fade out)
      if (interactionTimeRef.current < 4.0) {
        interactionTimeRef.current += deltaTime;
      }
      
      gl.uniform1f(uTime, (now - start) * 0.001);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uInteractionTime, interactionTimeRef.current);
      gl.uniform1f(uDirection, directionRef.current);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', updateCanvasSize);
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
  }, []);

  return <canvas ref={canvasRef} className={styles.headerGlslCanvas} />;
};

export default HeaderGLSLCanvas;

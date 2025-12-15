'use client';

import React, { useRef, useEffect, useState } from 'react';

interface ContinuousSmokeShaderProps {
  shape?: 'line' | 'circle' | 'button';
  className?: string;
  style?: React.CSSProperties;
}

const vsSource = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const fsSource = `
  precision mediump float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_res;
  uniform float u_shape; // 0.0 = line, 1.0 = circle, 2.0 = button

  // 2D noise helpers
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

  // Copied exactly from NavLinkShaderOverlay.tsx
  // Only difference is 'u_shape' handling
  void main() {
    vec2 uv = v_uv;
    
    // ZOOM EFFECT: Zoom out more for larger, softer features
    vec2 zoomedUV = (uv - 0.5) * 0.18 + 0.5;
    
    // Create a horizontal smoke effect that flows from left to right (slower)
    float flowTime = u_time * 0.25; // Slower, smoother flow
    
    // Horizontal flow with slight upward drift (subtle)
    vec2 flow = vec2(
      flowTime * 0.4,
      sin(flowTime * 0.8) * 0.05 - flowTime * 0.05
    );
    
    // ULTRA-SOFT SCALE: Very low frequency for "blurry" look
    // Was vec2(2.5, 4.0) -> Now vec2(1.5, 2.5)
    vec2 smokeUV = (zoomedUV - 0.5) * vec2(1.5, 2.5) + flow;
    
    // Create swirling smoke pattern
    float angleNoise = fbm(smokeUV * vec2(1.0, 1.5));
    float swirlAngle = (angleNoise - 0.5) * 0.6; // Subtle swirl
    mat2 rot = mat2(cos(swirlAngle), -sin(swirlAngle), sin(swirlAngle), cos(swirlAngle));
    vec2 p = rot * smokeUV;
    
    // Soft wave distortion
    p.y += sin(zoomedUV.x * 5.0 + flowTime * 1.2) * 0.12;
    p.x += cos(zoomedUV.y * 8.0 + flowTime * 0.8) * 0.08;
    
    // Compute smoke density with LOW frequency noise
    float d = fbm(p * vec2(1.5, 2.2) + flow);
    
    // REMOVED DETAIL LAYER ENTIRELY:
    // This eliminates all "grain" and "static", leaving only soft gradients.
    
    // --- ADAPTED MASKING START ---
    float shapeMask = 0.0;
    float pulseBrightness = 0.0;
    
    if (u_shape < 0.5) {
        // LINE SHAPE (Underline style)
        // Extremely soft vertical falloff
        shapeMask = 1.0 - smoothstep(0.0, 0.9, abs(uv.y - 0.5) * 1.6);
        
        // Edge softness
        float edgeFade = smoothstep(0.0, 0.25, uv.x) * smoothstep(1.0, 0.75, uv.x);
        shapeMask *= edgeFade;

        // Pulse Logic
        float pulseSpeed = 0.4;
        float pulsePosition = mod(u_time * pulseSpeed, 1.3) - 0.15;
        float pulseWidth = 0.6; // Wider
        
        float pulse1 = smoothstep(pulsePosition - pulseWidth, pulsePosition - pulseWidth * 0.3, uv.x) * 
                       smoothstep(pulsePosition + pulseWidth, pulsePosition + pulseWidth * 0.3, uv.x);
        
        pulseBrightness = pulse1 * 0.5;

    } else if (u_shape < 1.5) {
        // CIRCLE SHAPE (Ring style)
        float dist = length(uv - 0.5);
        // Reduced radius slightly (0.32 -> 0.30)
        float ringDist = abs(dist - 0.30); 
        // Ultra soft ring mask: 0.16 fade width
        shapeMask = 1.0 - smoothstep(0.0, 0.16, ringDist); 
        
        // Circular pulse
        float angle = atan(uv.y - 0.5, uv.x - 0.5);
        float pulseAngle = -u_time * 0.6;
        float angleDiff = abs(mod(angle - pulseAngle + 3.14159, 6.28318) - 3.14159);
        pulseBrightness = smoothstep(1.5, 0.0, angleDiff) * 0.4;
    } else {
        // BUTTON SHAPE (Pill/Capsule)
        // Use Pixel coordinates for uniform thickness
        vec2 pixelPos = (uv - 0.5) * u_res;
        
        // Define Pill Dimensions relative to canvas
        // Canvas is expanded by 20px (CSS). 
        // We want the line roughly 10-15px from the edge.
        // Subtracting non-uniform vector to tighten height more than width
        vec2 boxSize = (u_res * 0.5) - vec2(10.0, 40.0); 
        float radius = boxSize.y; // Fully rounded ends (pill)
        
        // SDF for Box part (width - height)
        // Pill geometry: Box of size (w-h, 0) + Radius h
        vec2 q = abs(pixelPos) - (boxSize - vec2(radius, 0.0));
        float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
        
        // Mask: Distance from the surface
        // Reduced fade width (4.5) for a thinner, more defined line
        shapeMask = 1.0 - smoothstep(0.0, 4.5, abs(dist));
        
        // Moving Pulse
        // Use a continuous linear wave for consistent visibility
        // Added distinct "bright spots" creating a moving sheen
        float linearFlow = (uv.x + uv.y) * 0.5 - u_time * 0.6;
        float wave = sin(linearFlow * 6.0); 
        pulseBrightness = smoothstep(0.2, 1.0, wave) * 0.6;
    }
    // --- ADAPTED MASKING END ---

    // Combine masks with very soft density threshold
    // Using (0.1, 0.9) makes the transition from transparent to opaque very gradual (blurry)
    float baseAlpha = smoothstep(0.1, 0.9, d) * shapeMask; 
    
    // Organic variation
    baseAlpha *= 0.85 + 0.15 * sin(u_time * 0.8 + uv.x * 2.0);
    
    // Final alpha adjustments
    float finalAlpha = baseAlpha * (1.0 + pulseBrightness * 0.2);
    
    // Color
    vec3 smokeColor = vec3(0.08, 0.12, 0.18);
    vec3 pulseColor = vec3(0.12, 0.16, 0.24);
    vec3 finalColor = mix(smokeColor, pulseColor, pulseBrightness * 0.3);
    
    // Keep reduced opacity (0.7)
    gl_FragColor = vec4(finalColor, finalAlpha * 0.7);
  }
`;

const ContinuousSmokeShader: React.FC<ContinuousSmokeShaderProps> = ({ shape = 'line', className, style }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const rafRef = useRef<number | null>(null);
  const uniformsRef = useRef<any>({});
  const isMountedRef = useRef(false);

  // Visibility state to manage Animation Loop (not context creation)
  const [isVisible, setIsVisible] = useState(false);

  // Intersection Observer to manage lifecycle
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      setIsVisible(entry.isIntersecting);
    }, {
      rootMargin: '200px 0px', // Pre-load slightly before coming into view
      threshold: 0
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Dynamic WebGL Lifecycle Management
  // Merged effect to ensure safe startup/teardown without conditional hook violations or race conditions.
  useEffect(() => {
    // If not visible or no container, we don't start the GL context
    // BUT we must adhere to hook rules. This effect will run when isVisible changes.
    if (!isVisible) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // --- WebGL Initialization ---
    // Initialize context
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: false,
        antialias: false,
        depth: false,
        preserveDrawingBuffer: true,
        failIfMajorPerformanceCaveat: false
      });
    } catch (e) {
      console.warn("WebGL Context creation failed", e);
    }

    if (!gl) return; // If GL failing is persistent, we just exit this effect run.

    glRef.current = gl;

    // Compile Shaders
    // (Helper inner function)
    const createShader = (type: number, source: string) => {
      const s = gl!.createShader(type); // gl is guaranteed non-null here in closure
      if (!s) return null;
      gl!.shaderSource(s, source);
      gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
        // Safe logging
        const log = gl!.getShaderInfoLog(s);
        console.warn('Shader compile error:', log);
        gl!.deleteShader(s);
        return null;
      }
      return s;
    };

    const vs = createShader(gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fsSource);

    // Fallback if shaders fail
    if (!vs || !fs) {
      // Cleanup partially created stuff if needed
      return;
    }

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Program link error:', gl.getProgramInfoLog(program));
      return;
    }

    gl.useProgram(program);
    programRef.current = program;

    // Buffer Setup
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Cache Uniform Locations
    uniformsRef.current = {
      u_time: gl.getUniformLocation(program, 'u_time'),
      u_res: gl.getUniformLocation(program, 'u_res'),
      u_shape: gl.getUniformLocation(program, 'u_shape'),
    };

    // Mark as ready
    isMountedRef.current = true;

    // --- Render Loop ---
    const render = () => {
      // Safety checks inside the loop
      if (!isMountedRef.current || !canvasRef.current) return;

      const gl = glRef.current;
      if (!gl) return; // Context lost or cleaned up

      const canvas = canvasRef.current;

      if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
        // Element might be hidden but not intersecting 0? wait.
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.floor(canvas.clientWidth * dpr);
      const targetH = Math.floor(canvas.clientHeight * dpr);

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        gl.viewport(0, 0, targetW, targetH);
      }

      const u = uniformsRef.current;
      const time = (Date.now() - startTimeRef.current) * 0.001;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(programRef.current);
      if (u.u_time) gl.uniform1f(u.u_time, time);
      if (u.u_res) gl.uniform2f(u.u_res, targetW, targetH);

      let shapeVal = 0.0;
      if (shape === 'circle') shapeVal = 1.0;
      if (shape === 'button') shapeVal = 2.0;

      if (u.u_shape) gl.uniform1f(u.u_shape, shapeVal);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      rafRef.current = requestAnimationFrame(render);
    };

    // Start loop
    render();

    // CLEANUP FUNCTION
    return () => {
      isMountedRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      const gl = glRef.current;
      if (gl) {
        // Try to lose context to free memory
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
      glRef.current = null;
      programRef.current = null;
    };
  }, [isVisible, shape]); // Re-run if visibility or shape changes

  return (
    <div ref={containerRef} className={className} style={{ width: '100%', height: '100%', position: 'absolute', ...style }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
};

export default ContinuousSmokeShader;

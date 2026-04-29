'use client';

import { useRef, useEffect, useId } from 'react';
import { getWebGLContextManager } from '@/utils/webglContextManager';

const vsSource = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

// Fragment shader transcribed from NavLinkShaderOverlay (the one Header
// nav-link hover uses) so the active scrubber line reads identically to
// a hovered nav link. Explosion logic is omitted — the scrubber switches
// states via a CSS opacity fade rather than a particle dispersion, but
// the active visual (zoomed flow, traveling pulse, vertical band, edge
// fade, contrast) matches.
const fsSource = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_res;
  uniform float u_hover_time;
  uniform float u_progress;

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

    // ZOOM EFFECT
    vec2 zoomedUV = (uv - 0.5) * 0.25 + 0.5;

    // Slow horizontal flow
    float flowTime = u_time * 0.5;

    vec2 flow = vec2(
      flowTime * 0.4,
      sin(flowTime * 1.2) * 0.08 - flowTime * 0.05
    );

    vec2 smokeUV = (zoomedUV - 0.5) * vec2(8.0, 12.0) + flow;

    float angleNoise = fbm(smokeUV * vec2(1.5, 2.0));
    float swirlAngle = (angleNoise - 0.5) * 1.0;
    mat2 rot = mat2(cos(swirlAngle), -sin(swirlAngle), sin(swirlAngle), cos(swirlAngle));
    vec2 p = rot * smokeUV;

    p.y += sin(zoomedUV.x * 15.0 + flowTime * 2.0) * 0.3;
    p.x += cos(zoomedUV.y * 20.0 + flowTime * 1.5) * 0.2;

    float d = fbm(p * vec2(2.5, 3.5) + flow);

    float detailNoise = fbm(p * vec2(5.0, 6.0) + flow * 0.5);
    d = mix(d, detailNoise, 0.3);

    float verticalMask = 1.0 - smoothstep(0.0, 0.5, abs(uv.y - 0.5) * 1.1);

    float formationMask = step(uv.x, u_progress);

    float pulseSpeed = 0.6;
    float pulsePosition = mod(u_time * pulseSpeed, 1.3) - 0.15;
    float pulseWidth = 0.35;

    float pulse1 = smoothstep(pulsePosition - pulseWidth, pulsePosition - pulseWidth * 0.3, uv.x) *
                   smoothstep(pulsePosition + pulseWidth, pulsePosition + pulseWidth * 0.3, uv.x);
    float pulse2 = smoothstep(pulsePosition - pulseWidth * 0.7, pulsePosition, uv.x) *
                   smoothstep(pulsePosition + pulseWidth * 0.7, pulsePosition, uv.x);

    float pulseBrightness = pulse1 * 0.7 + pulse2 * 0.3;
    pulseBrightness *= formationMask;

    float edgeFade = smoothstep(0.0, 0.08, uv.x) * smoothstep(1.0, 0.92, uv.x);

    float baseAlpha = smoothstep(0.3, 0.7, d) * verticalMask * formationMask * edgeFade;

    baseAlpha *= 0.75 + 0.25 * sin(u_time * 1.5 + uv.x * 4.0);

    baseAlpha = pow(baseAlpha, 0.8);

    float finalAlpha = baseAlpha * (1.0 + pulseBrightness * 0.25);

    vec3 smokeColor = vec3(0.08, 0.12, 0.18);
    vec3 pulseColor = vec3(0.09, 0.13, 0.20);
    vec3 finalColor = mix(smokeColor, pulseColor, pulseBrightness * 0.2);

    gl_FragColor = vec4(finalColor, finalAlpha * 1.5);
  }
`;

interface NavLinkGLSLCanvasProps {
  isHovered: boolean;
  width?: number;
  height?: number;
  /** When true, the canvas flows in normal layout (relative) instead of
   *  pinning under the parent (absolute, bottom: -4px). Use for cases
   *  where the host element already provides the line-shaped slot. */
  inline?: boolean;
}

const NavLinkGLSLCanvas = ({ isHovered, width = 100, height = 8, inline = false }: NavLinkGLSLCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverTimeRef = useRef<number>(0);
  const progressRef = useRef<number>(0);
  const isHoveredRef = useRef<boolean>(false);
  // Unique per-instance context id so each canvas gets its own GL context.
  const instanceId = useId();

  useEffect(() => {
    isHoveredRef.current = isHovered;
    if (!isHovered) {
      hoverTimeRef.current = 0;
      progressRef.current = 0;
    }
  }, [isHovered]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const contextManager = getWebGLContextManager();
    const contextId = `navlink-glsl-canvas-${instanceId}`;

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
  }, [width, height, instanceId]);

  return (
    <canvas
      ref={canvasRef}
      style={inline
        ? {
            position: 'relative',
            display: 'block',
            width: '100%',
            height: `${height}px`,
            pointerEvents: 'none',
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 0.3s ease',
            // Same compositor blur the Header's NavLinkShaderOverlay applies
            // — turns the GPU smoke noise into a soft, diffused trail.
            filter: 'blur(2px)',
          }
        : {
            position: 'absolute',
            bottom: '-4px',
            left: 0,
            width: '100%',
            height: `${height}px`,
            pointerEvents: 'none',
            opacity: isHovered ? 1 : 0,
            transition: 'opacity 0.3s ease',
            filter: 'blur(2px)',
          }
      }
    />
  );
};

export default NavLinkGLSLCanvas;

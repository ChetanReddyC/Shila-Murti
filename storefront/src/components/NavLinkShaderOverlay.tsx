'use client';

import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useEffect,
} from 'react';

export interface NavLinkShaderOverlayAPI {
  beginHover(linkElement: HTMLElement): void;
  updatePointer(clientX: number, clientY: number): void;
  endHover(): void;
}

interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
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
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_res;
  uniform float u_intensity;
  uniform float u_progress;
  uniform float u_explosion_time;

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
    
    // ZOOM EFFECT: Balanced zoom to see details but not too close
    vec2 zoomedUV = (uv - 0.5) * 0.25 + 0.5;
    
    // Create a horizontal smoke effect that flows from left to right (slower)
    float flowTime = u_time * 0.5; // Much slower flow
    
    // Horizontal flow with slight upward drift (subtle)
    vec2 flow = vec2(
      flowTime * 0.4,
      sin(flowTime * 1.2) * 0.08 - flowTime * 0.05
    );
    
    // Higher frequency for visible patterns in small area
    vec2 smokeUV = (zoomedUV - 0.5) * vec2(8.0, 12.0) + flow;
    
    // Create swirling smoke pattern with more detail
    float angleNoise = fbm(smokeUV * vec2(1.5, 2.0));
    float swirlAngle = (angleNoise - 0.5) * 1.0;
    mat2 rot = mat2(cos(swirlAngle), -sin(swirlAngle), sin(swirlAngle), cos(swirlAngle));
    vec2 p = rot * smokeUV;
    
    // Add more pronounced wave distortion for visible variation
    p.y += sin(zoomedUV.x * 15.0 + flowTime * 2.0) * 0.3;
    p.x += cos(zoomedUV.y * 20.0 + flowTime * 1.5) * 0.2;
    
    // Compute smoke density with higher frequency for more detail
    float d = fbm(p * vec2(2.5, 3.5) + flow);
    
    // Add extra detail layer for visible smoke wisps
    float detailNoise = fbm(p * vec2(5.0, 6.0) + flow * 0.5);
    d = mix(d, detailNoise, 0.3);
    
    // Shape the smoke to be thicker like an underline
    float verticalMask = 1.0 - smoothstep(0.0, 0.5, abs(uv.y - 0.5) * 1.1);
    
    // Formation progress - smoke reveals from left to right, then stays visible
    float formationMask = step(uv.x, u_progress);
    
    // Natural flowing pulse effect - travels from left to right slowly
    float pulseSpeed = 0.6; // Much slower, more natural
    float pulsePosition = mod(u_time * pulseSpeed, 1.3) - 0.15;
    float pulseWidth = 0.35; // Wider, softer pulse
    
    // Smooth, natural pulse using multiple layers
    float pulse1 = smoothstep(pulsePosition - pulseWidth, pulsePosition - pulseWidth * 0.3, uv.x) * 
                   smoothstep(pulsePosition + pulseWidth, pulsePosition + pulseWidth * 0.3, uv.x);
    
    // Secondary subtle pulse for depth
    float pulse2 = smoothstep(pulsePosition - pulseWidth * 0.7, pulsePosition, uv.x) * 
                   smoothstep(pulsePosition + pulseWidth * 0.7, pulsePosition, uv.x);
    
    float pulseBrightness = pulse1 * 0.7 + pulse2 * 0.3;
    
    // Only show pulse on formed areas
    pulseBrightness *= formationMask;
    
    // Edge softness
    float edgeFade = smoothstep(0.0, 0.08, uv.x) * smoothstep(1.0, 0.92, uv.x);
    
    // Combine all masks with more contrast for visible patterns
    float baseAlpha = smoothstep(0.3, 0.7, d) * verticalMask * formationMask * edgeFade;
    
    // Add more pronounced organic variation for visible smoke wisps
    baseAlpha *= 0.75 + 0.25 * sin(u_time * 1.5 + uv.x * 4.0);
    
    // Enhance contrast between dense and light areas
    baseAlpha = pow(baseAlpha, 0.8);
    
    // Add very subtle pulse brightness (not too aggressive)
    float finalAlpha = baseAlpha * (1.0 + pulseBrightness * 0.25);
    
    // === EXTREME EXPLOSION PHYSICS ===
    if (u_explosion_time > 0.0) {
      // Longer explosion duration ~1.5 seconds for far-reaching effect
      float explosionProgress = min(u_explosion_time / 1.5, 1.0);
      
      // Multiple noise layers for HIGHLY random directions (total chaos!)
      float disperseAngle1 = fbm(vec2(uv.x * 15.0, uv.y * 12.0)) * 6.28;
      float disperseAngle2 = fbm(vec2(uv.y * 18.0, uv.x * 14.0 + u_explosion_time)) * 3.14;
      float finalAngle = disperseAngle1 + disperseAngle2; // Combined randomness
      
      vec2 disperseDirection = vec2(cos(finalAngle), sin(finalAngle));
      
      // EXTREME Physics: VERY fast initial explosion, then slow down
      float velocity = 12.0 * (1.0 - explosionProgress * 0.5); // SUPER fast burst!
      float disperseAmount = u_explosion_time * velocity;
      
      // Add acceleration curve for explosive feeling (fast start, then decelerate)
      float acceleration = 1.0 + pow(1.0 - explosionProgress, 3.0) * 2.0;
      disperseAmount *= acceleration;
      
      // EXTREME upward drift (smoke shoots upward dramatically)
      float upwardDrift = u_explosion_time * 5.0;
      
      // Add spin/rotation to particles (they rotate as they explode)
      float spin = u_explosion_time * 3.0;
      float spinAngle = fbm(uv * 20.0) * spin;
      mat2 rotation = mat2(cos(spinAngle), -sin(spinAngle), sin(spinAngle), cos(spinAngle));
      disperseDirection = rotation * disperseDirection;
      
      // Apply EXTREME displacement (particles fly FAR away!)
      vec2 explodedUV = uv + disperseDirection * disperseAmount * 1.5 + vec2(0.0, -upwardDrift * 0.5);
      
      // Slower fade out so explosion is visible longer
      float explosionFade = 1.0 - smoothstep(0.5, 1.0, explosionProgress);
      finalAlpha *= explosionFade;
      
      // Make particles expand dramatically and become very wispy
      float distance = length(explodedUV - uv);
      float edgeWisp = 1.0 - smoothstep(0.0, 1.0, distance * 1.5);
      finalAlpha *= mix(1.0, edgeWisp * 0.4, explosionProgress);
      
      // EXTREME particle break-up (heavy fragmentation)
      float breakup1 = fbm(explodedUV * 20.0 + vec2(u_explosion_time * 8.0, 0.0));
      float breakup2 = fbm(explodedUV * 30.0 - vec2(0.0, u_explosion_time * 6.0));
      float combinedBreakup = mix(breakup1, breakup2, 0.5);
      finalAlpha *= mix(1.0, combinedBreakup, explosionProgress * 0.9);
      
      // Add turbulence (chaotic movement)
      float turbulence = fbm(explodedUV * 10.0 + u_explosion_time * 4.0);
      finalAlpha *= mix(1.0, turbulence, explosionProgress * 0.6);
    }
    
    // Apply global intensity for fade in/out
    finalAlpha *= u_intensity;
    
    // Smoke color - darker and more visible
    vec3 smokeColor = vec3(0.08, 0.12, 0.18);
    
    // Very subtle color shift for pulse (barely noticeable)
    vec3 pulseColor = vec3(0.09, 0.13, 0.20);
    vec3 finalColor = mix(smokeColor, pulseColor, pulseBrightness * 0.2);
    
    gl_FragColor = vec4(finalColor, finalAlpha * 1.5);
  }
`;

const NavLinkShaderOverlay = forwardRef<NavLinkShaderOverlayAPI, {}>((props, ref) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);

  const [active, setActive] = useState<boolean>(false);
  const [canvasRect, setCanvasRect] = useState<CanvasRect | null>(null);
  const [webglSupported, setWebglSupported] = useState<boolean>(true);
  const devicePixelRatioRef = useRef<number>(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

  const programRef = useRef<{
    program: WebGLProgram;
    attribs: { a_pos: number };
    uniforms: {
      u_res: WebGLUniformLocation | null;
      u_time: WebGLUniformLocation | null;
      u_intensity: WebGLUniformLocation | null;
      u_progress: WebGLUniformLocation | null;
      u_explosion_time: WebGLUniformLocation | null;
    };
  } | null>(null);
  const positionBufferRef = useRef<WebGLBuffer | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const intensityRef = useRef<number>(0);
  const progressRef = useRef<number>(0);
  const explosionTimeRef = useRef<number>(0);
  const isExplodingRef = useRef<boolean>(false);
  const baseLinkRectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);

  const positionCanvasOverLink = useCallback((linkElement: HTMLElement) => {
    const linkRect = linkElement.getBoundingClientRect();

    // Store base link rect for explosion calculations
    baseLinkRectRef.current = {
      left: linkRect.left,
      top: linkRect.bottom - 6,
      width: linkRect.width,
      height: 16
    };

    // Update React state
    setCanvasRect(baseLinkRectRef.current);

    // ALSO immediately apply via inline styles to avoid async delay
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.left = `${Math.round(baseLinkRectRef.current.left)}px`;
      canvas.style.top = `${Math.round(baseLinkRectRef.current.top)}px`;
      canvas.style.width = `${Math.round(baseLinkRectRef.current.width)}px`;
      canvas.style.height = `${Math.round(baseLinkRectRef.current.height)}px`;
    }
  }, []);

  useImperativeHandle(ref, () => ({
    beginHover(linkElement: HTMLElement) {
      // Cancel any ongoing explosion FIRST
      explosionTimeRef.current = 0;
      isExplodingRef.current = false;

      // Clear inline styles BEFORE repositioning (critical!)
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.left = '';
        canvas.style.top = '';
        canvas.style.width = '';
        canvas.style.height = '';
      }

      // Now position canvas for new link
      positionCanvasOverLink(linkElement);
      setActive(true);
      progressRef.current = 0;
    },
    updatePointer(clientX: number, clientY: number) {
      // Not needed for nav links, but kept for API consistency
    },
    endHover() {
      setActive(false);
      // Trigger explosion state instead of normal fade
      isExplodingRef.current = true;
      explosionTimeRef.current = 0;
    },
  }), [positionCanvasOverLink]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const initWebGL = () => {
      const gl = canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
      });
      if (!gl) {
        setWebglSupported(false);
        return;
      }
      glRef.current = gl;

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // Create quad buffer
      const positionBuffer = gl.createBuffer();
      if (!positionBuffer) return;
      positionBufferRef.current = positionBuffer;
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      const positions = new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1,
      ]);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

      // Compile shaders
      const vs = gl.createShader(gl.VERTEX_SHADER);
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      if (!vs || !fs) return;

      gl.shaderSource(vs, vsSource);
      gl.compileShader(vs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) return;

      gl.shaderSource(fs, fsSource);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) return;

      const program = gl.createProgram();
      if (!program) return;

      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

      programRef.current = {
        program,
        attribs: {
          a_pos: gl.getAttribLocation(program, 'a_pos'),
        },
        uniforms: {
          u_res: gl.getUniformLocation(program, 'u_res'),
          u_time: gl.getUniformLocation(program, 'u_time'),
          u_intensity: gl.getUniformLocation(program, 'u_intensity'),
          u_progress: gl.getUniformLocation(program, 'u_progress'),
          u_explosion_time: gl.getUniformLocation(program, 'u_explosion_time'),
        },
      };

      gl.deleteShader(vs);
      gl.deleteShader(fs);

      // Initial clear
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    };

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      glRef.current = null;
      programRef.current = null;
      positionBufferRef.current = null;
    };

    const handleContextRestored = () => {
      initWebGL();
    };

    canvas.addEventListener('webglcontextlost', handleContextLost as EventListener, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored as EventListener, false);

    initWebGL();

    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost as EventListener);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored as EventListener);
      const gl = glRef.current;
      if (gl) {
        if (positionBufferRef.current) gl.deleteBuffer(positionBufferRef.current);
        if (programRef.current) gl.deleteProgram(programRef.current.program);
      }
      glRef.current = null;
      programRef.current = null;
      positionBufferRef.current = null;
    };
  }, []);

  // DPR-aware sizing
  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = glRef.current;
    if (!canvas || !gl || !canvasRect) return;

    const dpr = devicePixelRatioRef.current;
    const targetWidth = Math.max(1, Math.floor(canvasRect.width * dpr));
    const targetHeight = Math.max(1, Math.floor(canvasRect.height * dpr));

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    gl.viewport(0, 0, targetWidth, targetHeight);

    if (programRef.current) {
      gl.useProgram(programRef.current.program);
      if (programRef.current.uniforms.u_res) {
        gl.uniform2f(programRef.current.uniforms.u_res, targetWidth, targetHeight);
      }
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }, [canvasRect]);

  // Monitor window resize
  useEffect(() => {
    const handleWindowResize = () => {
      devicePixelRatioRef.current = window.devicePixelRatio || 1;
      setCanvasRect(prev => (prev ? { ...prev } : prev));
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  // Render loop
  useEffect(() => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    if (!gl || !canvas) return;

    const EASING = 0.12;
    const PROGRESS_SPEED = 3.0;
    const EPS = 0.001;

    let lastFrameTime = performance.now();

    const render = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const deltaTime = (now - lastFrameTime) * 0.001; // Delta in seconds
      lastFrameTime = now;

      const elapsedSeconds = (now - startTimeRef.current) / 1000;

      // === EXPLOSION STATE MACHINE ===
      if (isExplodingRef.current) {
        // Update explosion time
        explosionTimeRef.current += deltaTime;

        // Keep intensity at 1 during explosion (shader handles the fade)
        intensityRef.current = 1.0;
        progressRef.current = 1.0; // Keep full progress during explosion

        // EXPAND CANVAS DYNAMICALLY during explosion for visible effect
        // Update directly via ref to avoid React re-render jitter
        if (baseLinkRectRef.current && canvas) {
          const explosionProgress = Math.min(explosionTimeRef.current / 1.5, 1.0);
          // Expand to 3x width and 5x height (80px tall)
          const expandFactor = 1.0 + explosionProgress * 2.0; // 1x -> 3x
          const heightExpandFactor = 1.0 + explosionProgress * 4.0; // 16px -> 80px

          const baseRect = baseLinkRectRef.current;
          const expandedWidth = baseRect.width * expandFactor;
          const expandedHeight = baseRect.height * heightExpandFactor;

          // Center expansion around original position
          const leftOffset = (expandedWidth - baseRect.width) / 2;
          const topOffset = (expandedHeight - baseRect.height) / 2;

          // Update canvas style directly (no React state = no jitter)
          canvas.style.left = `${Math.round(baseRect.left - leftOffset)}px`;
          canvas.style.top = `${Math.round(baseRect.top - topOffset)}px`;
          canvas.style.width = `${Math.round(expandedWidth)}px`;
          canvas.style.height = `${Math.round(expandedHeight)}px`;
        }

        // Explosion completes after 1.5 seconds (longer for dramatic effect)
        if (explosionTimeRef.current >= 1.5) {
          isExplodingRef.current = false;
          explosionTimeRef.current = 0;
          progressRef.current = 0;
          intensityRef.current = 0;

          // Clear inline styles before restoring via React state
          if (canvas) {
            canvas.style.left = '';
            canvas.style.top = '';
            canvas.style.width = '';
            canvas.style.height = '';
          }

          // Restore original canvas size via state (end of animation, one-time update is fine)
          if (baseLinkRectRef.current) {
            setCanvasRect(baseLinkRectRef.current);
          }
        }
      } else {
        // Normal hover state management
        // Smooth intensity fade in/out
        const targetIntensity = active ? 1 : 0;
        intensityRef.current += (targetIntensity - intensityRef.current) * EASING;
        if (Math.abs(intensityRef.current - targetIntensity) < EPS) intensityRef.current = targetIntensity;

        // Progress animation (grows from left to right)
        const deltaProgress = deltaTime * PROGRESS_SPEED;
        if (active) {
          progressRef.current = Math.min(1, progressRef.current + deltaProgress);
        } else {
          // Should not reach here if explosion is working
          progressRef.current = Math.max(0, progressRef.current - deltaProgress * 1.5);
        }
      }

      // Clear frame
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      // Render if we have intensity OR if we're exploding
      if ((intensityRef.current > EPS || isExplodingRef.current) && programRef.current) {
        const bundle = programRef.current;
        gl.useProgram(bundle.program);

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBufferRef.current);
        if (bundle.attribs.a_pos >= 0) {
          gl.enableVertexAttribArray(bundle.attribs.a_pos);
          gl.vertexAttribPointer(bundle.attribs.a_pos, 2, gl.FLOAT, false, 0, 0);
        }

        if (bundle.uniforms.u_res) gl.uniform2f(bundle.uniforms.u_res, canvasWidth, canvasHeight);
        if (bundle.uniforms.u_time) gl.uniform1f(bundle.uniforms.u_time, elapsedSeconds);
        if (bundle.uniforms.u_intensity) gl.uniform1f(bundle.uniforms.u_intensity, intensityRef.current);
        if (bundle.uniforms.u_progress) gl.uniform1f(bundle.uniforms.u_progress, progressRef.current);
        if (bundle.uniforms.u_explosion_time) gl.uniform1f(bundle.uniforms.u_explosion_time, explosionTimeRef.current);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      // Schedule next frame only if needed (including during explosion)
      if (active || intensityRef.current > EPS || progressRef.current > EPS || isExplodingRef.current) {
        rafIdRef.current = requestAnimationFrame(render);
      } else {
        rafIdRef.current = null;
      }
    };

    // Start loop if needed (including for explosion)
    if ((active || intensityRef.current > 0 || isExplodingRef.current) && rafIdRef.current == null) {
      rafIdRef.current = requestAnimationFrame(render);
    }

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [active, canvasRect]);



  const style: React.CSSProperties = canvasRect
    ? {
      position: 'fixed',
      left: `${Math.round(canvasRect.left)}px`,
      top: `${Math.round(canvasRect.top)}px`,
      width: `${Math.round(canvasRect.width)}px`,
      height: `${Math.round(canvasRect.height)}px`,
      pointerEvents: 'none',
      zIndex: 2000,
      opacity: 1,
      filter: 'blur(2px)',
    }
    : { opacity: 0, pointerEvents: 'none' };

  return (
    <div ref={rootRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2000 }}>
      {webglSupported && (
        <canvas ref={canvasRef} style={style} />
      )}
    </div>
  );
});

NavLinkShaderOverlay.displayName = 'NavLinkShaderOverlay';

export default NavLinkShaderOverlay;

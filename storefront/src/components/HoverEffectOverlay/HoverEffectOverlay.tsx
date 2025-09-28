import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useEffect,
} from 'react';
import styles from './HoverEffectOverlay.module.css';
import { createShader, createProgram } from '../../utils/shaderUtils';
import { vertexShaderSource, fragmentShaderSource } from '../../utils/shaderSources';
import { edgeGradientVertexShaderSource, edgeGradientFragmentShaderSource } from '../../utils/edgeGradientShaderSources';

export interface HoverOverlayAPI {
  beginHover(cardElement: HTMLElement): void;
  updatePointer(clientX: number, clientY: number): void;
  endHover(): void;
}

interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface HoverEffectOverlayProps {
  debug?: boolean;
}

const HoverEffectOverlay = forwardRef<HoverOverlayAPI, HoverEffectOverlayProps>(({ debug = false }, ref) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);

  const [active, setActive] = useState<boolean>(false);
  const [canvasRect, setCanvasRect] = useState<CanvasRect | null>(null);
  const [webglSupported, setWebglSupported] = useState<boolean>(true);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const devicePixelRatioRef = useRef<number>(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const isDebug = debug;
  const hostElRef = useRef<HTMLElement | null>(null);
  const [isHostedInCard, setIsHostedInCard] = useState<boolean>(false);

  type ProgramBundle = {
    program: WebGLProgram;
    attribs: { a_pos: number };
    uniforms: {
      u_res: WebGLUniformLocation | null;
      u_time: WebGLUniformLocation | null;
      u_intensity: WebGLUniformLocation | null;
      u_mouse: WebGLUniformLocation | null;
    };
  };

  const mainProgramRef = useRef<ProgramBundle | null>(null);
  const edgeProgramRef = useRef<ProgramBundle | null>(null);
  const positionBufferRef = useRef<WebGLBuffer | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const intensityRef = useRef<number>(0);
  const prewarmedRef = useRef<boolean>(false);

  const getContainerRect = useCallback((): DOMRect | null => {
    if (!rootRef.current) return null;
    return rootRef.current.getBoundingClientRect();
  }, []);

  const positionCanvasOverCard = useCallback((cardElement: HTMLElement) => {
    const containerRect = getContainerRect();
    const cardRect = cardElement.getBoundingClientRect();
    if (!containerRect) return;

    const left = cardRect.left - containerRect.left;
    const top = cardRect.top - containerRect.top;
    const width = cardRect.width;
    const height = cardRect.height;

    setCanvasRect({ left, top, width, height });
    if (isDebug) {
      // eslint-disable-next-line no-console
    }
  }, [getContainerRect]);

  useImperativeHandle(ref, () => ({
    beginHover(cardElement: HTMLElement) {
      positionCanvasOverCard(cardElement);
      // Reparent canvas into the hovered card's image section to layer beneath its foreground
      const canvas = canvasRef.current;
      if (canvas && cardElement !== hostElRef.current) {
        try {
          // Ensure host has positioning context
          const computed = window.getComputedStyle(cardElement);
          if (computed.position === 'static') {
            (cardElement as HTMLElement).style.position = 'relative';
          }
          // Insert canvas before the foreground wrapper if present, so it remains below the foreground
          const fgWrapper = cardElement.parentElement?.querySelector?.('.foregroundWrapper') as HTMLElement | null;
          if (fgWrapper && fgWrapper.parentElement === cardElement.parentElement) {
            cardElement.appendChild(canvas);
          } else {
            cardElement.appendChild(canvas);
          }
          // Reset style for in-card hosting
          canvas.style.left = '0px';
          canvas.style.top = '0px';
          canvas.style.width = '100%';
          canvas.style.height = '100%';
          setIsHostedInCard(true);
          hostElRef.current = cardElement;
        } catch (e) {
          if (isDebug) {
            // eslint-disable-next-line no-console
          }
        }
      }
      setActive(true);
    },
    updatePointer(clientX: number, clientY: number) {
      const containerRect = getContainerRect();
      if (!containerRect) return;
      pointerRef.current = {
        x: clientX - containerRect.left,
        y: clientY - containerRect.top,
      };
    },
    endHover() {
      setActive(false);
      pointerRef.current = null;
      if (isDebug) {
        // eslint-disable-next-line no-console
      }
      // Return canvas to overlay root to avoid leaving DOM inside card
      const canvas = canvasRef.current;
      if (canvas && rootRef.current && isHostedInCard) {
        try {
          rootRef.current.appendChild(canvas);
          setIsHostedInCard(false);
          hostElRef.current = null;
        } catch (e) {
          if (isDebug) {
            // eslint-disable-next-line no-console
          }
        }
      }
    },
  }), [getContainerRect, positionCanvasOverCard]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const initWebGL = () => {
      const gl = canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        antialias: true,
        powerPreference: 'high-performance',
      });
      if (!gl) {
        setWebglSupported(false);
        if (isDebug) {
          // eslint-disable-next-line no-console
        }
        return;
      }
      glRef.current = gl;

      // Blending for alpha compositing
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // Create shared quad buffer: two triangles covering NDC (-1..1)
      const positionBuffer = gl.createBuffer();
      if (!positionBuffer) {
        if (isDebug) {
          // eslint-disable-next-line no-console
        }
        return;
      }
      positionBufferRef.current = positionBuffer;
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      const positions = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
      ]);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

      // Compile/link main program
      const mainVertex = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
      const mainFragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
      if (mainVertex && mainFragment) {
        const mainProg = createProgram(gl, mainVertex, mainFragment);
        if (mainProg) {
          mainProgramRef.current = {
            program: mainProg,
            attribs: {
              a_pos: gl.getAttribLocation(mainProg, 'a_pos'),
            },
            uniforms: {
              u_res: gl.getUniformLocation(mainProg, 'u_res'),
              u_time: gl.getUniformLocation(mainProg, 'u_time'),
              u_intensity: gl.getUniformLocation(mainProg, 'u_intensity'),
              u_mouse: gl.getUniformLocation(mainProg, 'u_mouse'),
            },
          };
        }
        // Shaders can be deleted after linking
        gl.deleteShader(mainVertex);
        gl.deleteShader(mainFragment);
      }

      // Compile/link edge gradient program
      const edgeVertex = createShader(gl, gl.VERTEX_SHADER, edgeGradientVertexShaderSource);
      const edgeFragment = createShader(gl, gl.FRAGMENT_SHADER, edgeGradientFragmentShaderSource);
      if (edgeVertex && edgeFragment) {
        const edgeProg = createProgram(gl, edgeVertex, edgeFragment);
        if (edgeProg) {
          edgeProgramRef.current = {
            program: edgeProg,
            attribs: {
              a_pos: gl.getAttribLocation(edgeProg, 'a_pos'),
            },
            uniforms: {
              u_res: gl.getUniformLocation(edgeProg, 'u_res'),
              u_time: gl.getUniformLocation(edgeProg, 'u_time'),
              u_intensity: gl.getUniformLocation(edgeProg, 'u_intensity'),
              u_mouse: gl.getUniformLocation(edgeProg, 'u_mouse'),
            },
          };
        }
        gl.deleteShader(edgeVertex);
        gl.deleteShader(edgeFragment);
      }

      // Initial clear
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (isDebug) {
        // eslint-disable-next-line no-console
      }

      // Prewarm: draw a tiny frame with zero intensity to avoid first-hover jank
      try {
        if (!prewarmedRef.current && positionBufferRef.current) {
          const bundles: Array<ProgramBundle | null> = [mainProgramRef.current, edgeProgramRef.current];
          bundles.forEach((bundle) => {
            if (!bundle) return;
            gl.useProgram(bundle.program);
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBufferRef.current);
            if (bundle.attribs.a_pos >= 0) {
              gl.enableVertexAttribArray(bundle.attribs.a_pos);
              gl.vertexAttribPointer(bundle.attribs.a_pos, 2, gl.FLOAT, false, 0, 0);
            }
            if (bundle.uniforms.u_res) gl.uniform2f(bundle.uniforms.u_res, 1, 1);
            if (bundle.uniforms.u_time) gl.uniform1f(bundle.uniforms.u_time, 0);
            if (bundle.uniforms.u_intensity) gl.uniform1f(bundle.uniforms.u_intensity, 0);
            if (bundle.uniforms.u_mouse) gl.uniform2f(bundle.uniforms.u_mouse, 0, 0);
            gl.viewport(0, 0, 1, 1);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
          });
          gl.flush();
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          prewarmedRef.current = true;
          if (isDebug) {
            // eslint-disable-next-line no-console
          }
        }
      } catch (e) {
        if (isDebug) {
          // eslint-disable-next-line no-console
        }
      }
    };

    // Context lost/restored handling
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      if (isDebug) {
        // eslint-disable-next-line no-console
      }
      glRef.current = null;
      mainProgramRef.current = null;
      edgeProgramRef.current = null;
      positionBufferRef.current = null;
    };
    const handleContextRestored = () => {
      if (isDebug) {
        // eslint-disable-next-line no-console
      }
      initWebGL();
      // After restore, sizing will be reapplied by the size effect below
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
        if (mainProgramRef.current) gl.deleteProgram(mainProgramRef.current.program);
        if (edgeProgramRef.current) gl.deleteProgram(edgeProgramRef.current.program);
      }
      glRef.current = null;
      mainProgramRef.current = null;
      edgeProgramRef.current = null;
      positionBufferRef.current = null;
    };
  }, []);

  // DPR-aware sizing and viewport updates when rect or DPR changes
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

    // Initialize u_res on programs (drawing will also update later)
    if (mainProgramRef.current) {
      gl.useProgram(mainProgramRef.current.program);
      if (mainProgramRef.current.uniforms.u_res) {
        gl.uniform2f(mainProgramRef.current.uniforms.u_res, targetWidth, targetHeight);
      }
    }
    if (edgeProgramRef.current) {
      gl.useProgram(edgeProgramRef.current.program);
      if (edgeProgramRef.current.uniforms.u_res) {
        gl.uniform2f(edgeProgramRef.current.uniforms.u_res, targetWidth, targetHeight);
      }
    }

    // Clear after resizing
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (isDebug) {
      // eslint-disable-next-line no-console
    }
  }, [canvasRect]);

  // Monitor DPR changes (rare) and window resize to update sizing
  useEffect(() => {
    const handleWindowResize = () => {
      devicePixelRatioRef.current = window.devicePixelRatio || 1;
      // Trigger a small rect update to force sizing effect
      setCanvasRect(prev => (prev ? { ...prev } : prev));
      if (isDebug) {
        // eslint-disable-next-line no-console
      }
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  // Render loop: runs only when active or while fading out
  useEffect(() => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    if (!gl || !canvas) return;

    const EASING = 0.12;
    const EPS = 0.001;

    const render = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsedSeconds = (now - startTimeRef.current) / 1000;

      const target = active ? 1 : 0;
      intensityRef.current += (target - intensityRef.current) * EASING;
      if (Math.abs(intensityRef.current - target) < EPS) intensityRef.current = target;

      // Clear frame
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      // Compute mouse in pixel coords relative to canvas, origin bottom-left
      let mouseXPx = 0;
      let mouseYPx = 0;
      if (pointerRef.current && canvasRect) {
        const dpr = devicePixelRatioRef.current;
        const localX = pointerRef.current.x - canvasRect.left;
        const localYTop = pointerRef.current.y - canvasRect.top;
        mouseXPx = Math.max(0, Math.min(canvasWidth, Math.round(localX * dpr)));
        const yFromBottom = canvasHeight - Math.round(localYTop * dpr);
        mouseYPx = Math.max(0, Math.min(canvasHeight, yFromBottom));
      }

      const drawWithProgram = (bundle: ProgramBundle | null) => {
        if (!bundle) return;
        gl.useProgram(bundle.program);
        // attrib
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBufferRef.current);
        if (bundle.attribs.a_pos >= 0) {
          gl.enableVertexAttribArray(bundle.attribs.a_pos);
          gl.vertexAttribPointer(bundle.attribs.a_pos, 2, gl.FLOAT, false, 0, 0);
        }
        // uniforms
        if (bundle.uniforms.u_res) gl.uniform2f(bundle.uniforms.u_res, canvasWidth, canvasHeight);
        if (bundle.uniforms.u_time) gl.uniform1f(bundle.uniforms.u_time, elapsedSeconds);
        if (bundle.uniforms.u_intensity) gl.uniform1f(bundle.uniforms.u_intensity, intensityRef.current);
        if (bundle.uniforms.u_mouse) gl.uniform2f(bundle.uniforms.u_mouse, mouseXPx, mouseYPx);
        // draw
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      };

      if (intensityRef.current > EPS) {
        // Main effect then edge gradient (uses blending)
        drawWithProgram(mainProgramRef.current);
        drawWithProgram(edgeProgramRef.current);
      }

      // Schedule next frame only if needed
      if (active || intensityRef.current > EPS) {
        rafIdRef.current = requestAnimationFrame(render);
      } else {
        rafIdRef.current = null;
      }
    };

    // Start loop if needed
    if (active && rafIdRef.current == null) {
      rafIdRef.current = requestAnimationFrame(render);
    }

    // If becoming inactive but still have intensity, ensure loop continues until fade completes
    if (!active && intensityRef.current > 0 && rafIdRef.current == null) {
      rafIdRef.current = requestAnimationFrame(render);
    }

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [active, canvasRect]);

  const style: React.CSSProperties = isHostedInCard
    ? {
        position: 'absolute',
        left: '0px',
        top: '0px',
        width: '100%',
        height: '100%',
        opacity: 1,
        transform: 'translateZ(0)',
        zIndex: 50,
      }
    : canvasRect
    ? {
        left: `${Math.round(canvasRect.left)}px`,
        top: `${Math.round(canvasRect.top)}px`,
        width: `${Math.round(canvasRect.width)}px`,
        height: `${Math.round(canvasRect.height)}px`,
        opacity: 1,
        transform: 'translateZ(0)',
        zIndex: 50,
      }
    : { opacity: 0 };

  return (
    <div ref={rootRef} className={styles.overlayRoot} aria-hidden>
      {webglSupported && (
        <canvas ref={canvasRef} className={styles.overlayCanvas} style={style} />
      )}
    </div>
  );
});

HoverEffectOverlay.displayName = 'HoverEffectOverlay';

export default HoverEffectOverlay;



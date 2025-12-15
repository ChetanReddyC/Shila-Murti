import React, { useEffect, useRef, useState } from 'react';

// --- Types ---
export type SmokeShape = 'line' | 'circle' | 'button';

// --- Shaders ---
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

  void main() {
    vec2 uv = v_uv;
    
    // ZOOM EFFECT
    vec2 zoomedUV = (uv - 0.5) * 0.18 + 0.5;
    
    // Horizontal flow - varies slightly by shape to optimize look
    float flowTime = u_time * 0.25;
    vec2 flow = vec2(flowTime * 0.4, sin(flowTime * 0.8) * 0.05 - flowTime * 0.05);
    
    // Scale
    vec2 smokeUV = (zoomedUV - 0.5) * vec2(1.5, 2.5) + flow;
    
    // Swirl
    float angleNoise = fbm(smokeUV * vec2(1.0, 1.5));
    float swirlAngle = (angleNoise - 0.5) * 0.6;
    mat2 rot = mat2(cos(swirlAngle), -sin(swirlAngle), sin(swirlAngle), cos(swirlAngle));
    vec2 p = rot * smokeUV;
    
    // Wave
    p.y += sin(zoomedUV.x * 5.0 + flowTime * 1.2) * 0.12;
    p.x += cos(zoomedUV.y * 8.0 + flowTime * 0.8) * 0.08;
    
    // Density
    float d = fbm(p * vec2(1.5, 2.2) + flow);
    
    // Masking
    float shapeMask = 0.0;
    float pulseBrightness = 0.0;
    
    if (u_shape < 0.5) {
        // LINE
        shapeMask = 1.0 - smoothstep(0.0, 0.9, abs(uv.y - 0.5) * 1.6);
        float edgeFade = smoothstep(0.0, 0.25, uv.x) * smoothstep(1.0, 0.75, uv.x);
        shapeMask *= edgeFade;

        float pulseSpeed = 0.4;
        float pulsePosition = mod(u_time * pulseSpeed, 1.3) - 0.15;
        float pulseWidth = 0.6;
        float pulse1 = smoothstep(pulsePosition - pulseWidth, pulsePosition - pulseWidth * 0.3, uv.x) * 
                       smoothstep(pulsePosition + pulseWidth, pulsePosition + pulseWidth * 0.3, uv.x);
        pulseBrightness = pulse1 * 0.5;

    } else if (u_shape < 1.5) {
        // CIRCLE
        float dist = length(uv - 0.5);
        float ringDist = abs(dist - 0.30); 
        shapeMask = 1.0 - smoothstep(0.0, 0.16, ringDist); 
        
        float angle = atan(uv.y - 0.5, uv.x - 0.5);
        float pulseAngle = -u_time * 0.6;
        float angleDiff = abs(mod(angle - pulseAngle + 3.14159, 6.28318) - 3.14159);
        pulseBrightness = smoothstep(1.5, 0.0, angleDiff) * 0.4;
    } else {
        // BUTTON
        vec2 pixelPos = (uv - 0.5) * u_res;
        // Adjust boxing for padding
        // Since we are now LOCAL to the button+padding, we just fit the box
        // The bounds are approx -20px on all sides.
        // We want the smoke to hug the "real" button which is width-40, height-40 inside here.
        
        vec2 boxSize = (u_res * 0.5) - vec2(24.0, 36.0); // Tweak padding offset (Increased Y subtraction to reduce height)
        boxSize = max(boxSize, vec2(10.0, 10.0));
        
        float radius = boxSize.y; 
        
        vec2 q = abs(pixelPos) - (boxSize - vec2(radius, 0.0));
        float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
        
        // Soft thick smoke
        shapeMask = 1.0 - smoothstep(0.0, 4.5, abs(dist));
        
        float linearFlow = (uv.x + uv.y) * 0.5 - u_time * 0.6;
        float wave = sin(linearFlow * 6.0); 
        pulseBrightness = smoothstep(0.2, 1.0, wave) * 0.6;
    }

    float baseAlpha = smoothstep(0.1, 0.9, d) * shapeMask; 
    baseAlpha *= 0.85 + 0.15 * sin(u_time * 0.8 + uv.x * 2.0);
    float finalAlpha = baseAlpha * (1.0 + pulseBrightness * 0.2);
    
    vec3 smokeColor = vec3(0.08, 0.12, 0.18);
    vec3 pulseColor = vec3(0.12, 0.16, 0.24);
    vec3 finalColor = mix(smokeColor, pulseColor, pulseBrightness * 0.3);
    
    gl_FragColor = vec4(finalColor, finalAlpha * 0.7);
  }
`;


// --- Individual Smoke Component ---
const SmokeElement = ({ shape }: { shape: SmokeShape }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const startTimeRef = useRef(Date.now());

    // Visibility optimization
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new IntersectionObserver(([entry]) => {
            setIsVisible(entry.isIntersecting);
        }, { threshold: 0.0, rootMargin: '100px' });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!isVisible) return; // Don't run loop if off-screen (saves GPU)

        const canvas = canvasRef.current;
        if (!canvas) return;

        let gl = canvas.getContext('webgl', {
            alpha: true,
            premultipliedAlpha: false,
            depth: false,
            antialias: false
        });

        if (!gl) return;

        // Compile Shaders
        const createShader = (type: number, src: string) => {
            const s = gl!.createShader(type);
            if (!s) return null;
            gl!.shaderSource(s, src);
            gl!.compileShader(s);
            if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) return null;
            return s;
        };
        const vs = createShader(gl.VERTEX_SHADER, vsSource);
        const fs = createShader(gl.FRAGMENT_SHADER, fsSource);

        if (vs && fs) {
            const p = gl.createProgram();
            if (p) {
                gl.attachShader(p, vs);
                gl.attachShader(p, fs);
                gl.linkProgram(p);
                programRef.current = p;
            }
        }

        if (!programRef.current) return;

        // Vertices
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

        const locs = {
            a_pos: gl.getAttribLocation(programRef.current, 'a_pos'),
            u_time: gl.getUniformLocation(programRef.current, 'u_time'),
            u_res: gl.getUniformLocation(programRef.current, 'u_res'),
            u_shape: gl.getUniformLocation(programRef.current, 'u_shape'),
        };

        gl.enableVertexAttribArray(locs.a_pos);
        gl.vertexAttribPointer(locs.a_pos, 2, gl.FLOAT, false, 0, 0);

        const render = () => {
            if (!canvas || !gl || !programRef.current) return;

            // Resize logic (Local)
            // We use clientWidth/Height of the container to sizing
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const cw = Math.floor(canvas.clientWidth * dpr);
            const ch = Math.floor(canvas.clientHeight * dpr);

            if (canvas.width !== cw || canvas.height !== ch) {
                canvas.width = cw;
                canvas.height = ch;
                gl.viewport(0, 0, cw, ch);
            }

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.useProgram(programRef.current);

            const time = (Date.now() - startTimeRef.current) * 0.001;
            gl.uniform1f(locs.u_time, time);
            gl.uniform2f(locs.u_res, cw, ch);
            gl.uniform1f(locs.u_shape, shape === 'circle' ? 1.0 : shape === 'button' ? 2.0 : 0.0);

            gl.drawArrays(gl.TRIANGLES, 0, 6);

            rafRef.current = requestAnimationFrame(render);
        };

        rafRef.current = requestAnimationFrame(render);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            // Optional: clean up GL context if highly constrained, but usually letting GC handle it is fine for <10 items
            // gl.getExtension('WEBGL_lose_context')?.loseContext();
        };

    }, [isVisible, shape]);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
            <canvas
                ref={canvasRef}
                style={{ width: '100%', height: '100%', display: 'block' }}
            />
        </div>
    );
};


// --- Legacy Wrappers for Compatibility ---

// 1. Overlay Wrapper: Now just a pass-through (or context-less wrapper)
// The children (smoke targets) will manage themselves.
export default function SharedSmokeOverlay({ children, className }: { children: React.ReactNode, className?: string }) {
    return (
        <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
            {children}
        </div>
    );
}

// 2. Target: Now renders the SmokeElement directly
export function SharedSmokeTarget({ id, shape, className, style }: { id: string, shape: SmokeShape, className?: string, style?: React.CSSProperties }) {
    return (
        <div
            id={id}
            className={className}
            style={{
                ...style,
                position: style?.position || 'absolute', // Default to absolute per CSS usage, or keep existing logic
                overflow: 'hidden',
                pointerEvents: 'none',
                zIndex: 25 // Force Z-Index here for visibility
            }}
        >
            <SmokeElement shape={shape} />
        </div>
    );
}

'use client';

import { useRef, useEffect, useState } from 'react';
import styles from './GLSLCanvas.module.css';

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
    float t = u_time * 0.4;

    // radial mask for formation shape
    float r = length(uv) * 1.2;
    float mask = smoothstep(1.0, 0.4, r);

    // swirl field guided by radial distance
    float angleNoise = fbm(uv * 1.5 + vec2(0.0, -t));
    float swirlAngle = mix(1.0, 4.0, mask) * (angleNoise - 0.5) * 3.1415;
    mat2 rot = mat2(cos(swirlAngle), -sin(swirlAngle), sin(swirlAngle), cos(swirlAngle));
    vec2 p = rot * uv;

    // layered sinusoidal distortion for structure
    p += vec2(
      sin((uv.y + t) * 3.0) * 0.2,
      cos((uv.x - t) * 3.0) * 0.2
    ) * mask;

    // compute density
    float d = fbm(p * 1.3 - vec2(0.0, t * 0.6));
    d *= 0.8 * mask; // Increased from 0.6 to 0.8 for more density
    float alpha = smoothstep(0.25, 0.6, d); // Adjusted from 0.35, 0.65 to make more of the effect visible

    // Create a smooth transparent border
    float border_width = 0.3; // 20% border on each side for fade
    vec2 smooth_border = smoothstep(0.0, border_width, v_uv) * (1.0 - smoothstep(1.0 - border_width, 1.0, v_uv));
    float edge_mask = smooth_border.x * smooth_border.y;

    // color blending
    vec3 fluid = vec3(0.15, 0.2, 0.25); // Slightly darker color for better visibility
    gl_FragColor = vec4(fluid, alpha * edge_mask);
  }
`;

const GLSLCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const animationRef = useRef<number | null>(null);
  
  // Canvas WebGL setup and rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { 
      alpha: true,
      preserveDrawingBuffer: false,
      antialias: false,
      depth: false,
      stencil: false
    });
    if (!gl) {
      console.warn('[GLSLCanvas] Failed to get WebGL context');
      return;
    }
    
    // Handle context loss gracefully
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.warn('[GLSLCanvas] WebGL context lost');
    };
    
    const handleContextRestored = () => {
      console.log('[GLSLCanvas] WebGL context restored');
    };
    
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);
    
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    canvas.width = 400;
    canvas.height = 300;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
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
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_res');
    gl.uniform2f(uRes, canvas.width, canvas.height);

    const start = performance.now();
    let animationFrameId: number;

    const render = () => {
      gl.uniform1f(uTime, (performance.now() - start) * 0.001);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
        
        // Force context loss to free up resources
        const loseContext = gl.getExtension('WEBGL_lose_context');
        if (loseContext) {
          loseContext.loseContext();
        }
      }
    };
  }, []);

  // Subtle random movement effect
  useEffect(() => {
    let startTime = Date.now();
    let lastUpdateTime = startTime;
    let currentAngle = Math.random() * Math.PI * 2;
    let targetAngle = currentAngle;
    let currentSpeed = 0;
    let targetSpeed = 0;
    const maxSpeed = 0.3; // Reduced from 0.5 for less shakiness
    
    // Base position is the original CSS position
    const baseX = 0;
    const baseY = 0;
    
    // Movement constraints (% of window size)
    const maxDownPercent = 50;
    const maxUpPercent = 10;
    const maxLeftRightPercent = 5;
    
    // Convert to actual pixels
    const maxDown = window.innerHeight * (maxDownPercent / 100);
    const maxUp = window.innerHeight * (maxUpPercent / 100);
    const maxLeftRight = window.innerWidth * (maxLeftRightPercent / 100);
    
    // For smoother movement
    let lastX = 0;
    let lastY = 0;
    let velocityX = 0;
    let velocityY = 0;
    
    const updatePosition = () => {
      const now = Date.now();
      const elapsed = Math.min(now - lastUpdateTime, 50); // Cap elapsed time to avoid big jumps
      const elapsedSec = elapsed / 1000;
      lastUpdateTime = now;
      
      // Occasionally change target angle (every 3-8 seconds - longer for more stability)
      if (now - startTime > Math.random() * 5000 + 3000) {
        targetAngle = Math.random() * Math.PI * 2;
        // Adjust speed based on distance from center - slower when near edges
        const distanceFromCenter = Math.sqrt(lastX * lastX + lastY * lastY);
        const maxDistance = Math.max(maxDown, maxLeftRight);
        const distanceRatio = distanceFromCenter / maxDistance;
        
        // Slower speed when near edges to prevent shakiness
        targetSpeed = maxSpeed * (1 - Math.pow(distanceRatio, 2) * 0.7);
        startTime = now;
      }
      
      // Smoothly interpolate to target angle with damping
      const angleDiff = targetAngle - currentAngle;
      // Normalize angle difference to avoid spinning the wrong way
      const normalizedDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
      currentAngle += normalizedDiff * (elapsedSec * 0.8); // Slower angle change
      
      // Smoothly adjust speed with more damping
      currentSpeed += (targetSpeed - currentSpeed) * (elapsedSec * 1.5);
      
      // Calculate new position with damping
      const targetDeltaX = Math.cos(currentAngle) * currentSpeed;
      const targetDeltaY = Math.sin(currentAngle) * currentSpeed;
      
      // Apply damping to velocity for smoother movement
      const damping = 0.9;
      velocityX = velocityX * damping + targetDeltaX * (1 - damping);
      velocityY = velocityY * damping + targetDeltaY * (1 - damping);
      
      // Only update position if the change is significant
      if (Math.abs(velocityX) > 0.01 || Math.abs(velocityY) > 0.01) {
        setPosition(prev => {
          // Calculate new position with damping
          let newX = prev.x + velocityX;
          let newY = prev.y + velocityY;
          
          // Apply constraints to keep within bounds
          // X constraints (left/right)
          if (newX > maxLeftRight) {
            newX = maxLeftRight;
            velocityX *= -0.5; // Softer bounce
            currentAngle = Math.PI - currentAngle;
          } else if (newX < -maxLeftRight) {
            newX = -maxLeftRight;
            velocityX *= -0.5; // Softer bounce
            currentAngle = Math.PI - currentAngle;
          }
          
          // Y constraints (up/down)
          if (newY > maxDown) {
            newY = maxDown;
            velocityY *= -0.5; // Softer bounce
            currentAngle = -currentAngle;
          } else if (newY < -maxUp) {
            newY = -maxUp;
            velocityY *= -0.5; // Softer bounce
            currentAngle = -currentAngle;
          }
          
          lastX = newX;
          lastY = newY;
          
          return { x: newX, y: newY };
        });
      }
      
      animationRef.current = requestAnimationFrame(updatePosition);
    };
    
    animationRef.current = requestAnimationFrame(updatePosition);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const canvasStyle = {
    transform: `translate(${position.x}px, ${position.y}px)`,
    transition: 'transform 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)'
  };

  return <canvas ref={canvasRef} className={styles.glslCanvas} style={canvasStyle} />;
};

export default GLSLCanvas; 
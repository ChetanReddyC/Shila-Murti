'use client';

import React, { useEffect, useState, useRef } from 'react';
import styles from './LoadingScreen.module.css';

export interface LoadingScreenProps {
  show?: boolean;
  onComplete?: () => void;
  duration?: number;
  imageSrc?: string;
  shaderEffect?: 'smoke';
}

export default function LoadingScreen({ 
  show = true, 
  onComplete,
  duration = 2000,
  imageSrc,
  shaderEffect = 'smoke'
}: LoadingScreenProps) {
  const [isVisible, setIsVisible] = useState(show);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!show && isVisible) {
      setIsAnimatingOut(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        onComplete?.();
      }, 600);
      return () => clearTimeout(timer);
    } else if (show && !isVisible) {
      setIsVisible(true);
      setIsAnimatingOut(false);
    }
  }, [show, isVisible, onComplete]);

  useEffect(() => {
    if (!isVisible || !imageSrc) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      console.warn('WebGL not supported');
      return;
    }

    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const getFragmentShader = () => {
      // Professional Smoke Dissolution Effect
      if (shaderEffect === 'smoke') {
        return `
          precision highp float;
          uniform sampler2D u_image;
          uniform float u_time;
          varying vec2 v_texCoord;
          
          // High quality hash
          float hash(vec2 p) {
            vec3 p3 = fract(vec3(p.xyx) * 0.13);
            p3 += dot(p3, p3.yzx + 19.19);
            return fract((p3.x + p3.y) * p3.z);
          }
          
          // Smooth value noise
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0); // Quintic interpolation
            
            float a = hash(i + vec2(0.0, 0.0));
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
          }
          
          // High-octave FBM for detailed turbulence
          float fbm(vec2 p) {
            float value = 0.0;
            float amplitude = 0.5;
            float frequency = 1.0;
            
            for(int i = 0; i < 7; i++) {
              value += amplitude * noise(p * frequency);
              frequency *= 2.17; // Non-integer multiplier for less repetition
              amplitude *= 0.52;
            }
            return value;
          }
          
          // Curl noise for natural swirling motion
          vec2 curlNoise(vec2 p) {
            float eps = 0.1;
            float n1 = fbm(p + vec2(eps, 0.0));
            float n2 = fbm(p - vec2(eps, 0.0));
            float n3 = fbm(p + vec2(0.0, eps));
            float n4 = fbm(p - vec2(0.0, eps));
            
            float dx = (n1 - n2) / (2.0 * eps);
            float dy = (n3 - n4) / (2.0 * eps);
            
            return vec2(dy, -dx); // Perpendicular gradient for curl
          }
          
          void main() {
            vec2 uv = v_texCoord;
            float t = u_time * 0.3; // Continuous time
            
            // Fixed origin - bottom-left corner for consistent direction
            vec2 origin = vec2(0.0, 1.0);
            
            vec2 toPixel = uv - origin;
            float dist = length(toPixel);
            vec2 direction = normalize(toPixel + vec2(0.001));
            
            // Two-phase animation: materialize then dissolve
            float cycle = 8.0; // 8 seconds per full cycle (4s appear + 4s disappear)
            float normalizedTime = mod(t, cycle) / cycle;
            
            // Phase 1 (0.0-0.5): Materialization from smoke
            // Phase 2 (0.5-1.0): Dissolution to smoke
            bool isMaterializing = normalizedTime < 0.5;
            float phaseTime = isMaterializing ? (normalizedTime * 2.0) : ((normalizedTime - 0.5) * 2.0);
            
            // For materialization, reverse the progression (1.0 -> 0.0)
            // For dissolution, normal progression (0.0 -> 1.0)
            float dissolutionProgress = isMaterializing ? 
              (1.0 - smoothstep(0.0, 0.9, phaseTime)) * 2.0 : 
              smoothstep(0.0, 0.9, phaseTime) * 2.0;
            
            // Multi-layer noise for complex dissolution pattern
            // Use phaseTime to keep noise consistent within each phase
            float primaryNoise = fbm(uv * 4.0 + phaseTime * 2.0);
            float secondaryNoise = fbm(uv * 8.0 - phaseTime * 1.5);
            float detailNoise = noise(uv * 16.0 + phaseTime * 3.0);
            
            // Dissolution threshold - moves from corner outward
            float threshold = smoothstep(dissolutionProgress - 0.5, dissolutionProgress + 0.3, dist);
            
            // Complex dissolution mask with multiple noise layers
            float dissolveMask = threshold;
            dissolveMask += primaryNoise * 0.25;
            dissolveMask += secondaryNoise * 0.12;
            dissolveMask += detailNoise * 0.06;
            dissolveMask = smoothstep(0.4, 0.8, dissolveMask);
            
            // Gentle curl noise for realistic smoke motion (reduced strength)
            vec2 curlOffset = curlNoise(uv * 2.0 + phaseTime * 1.5) * 0.04;
            vec2 flowDirection = direction + curlOffset;
            
            // Reduced displacement to prevent flipping
            float displacementStrength = pow(1.0 - dissolveMask, 2.5) * 0.15;
            vec2 displacement = flowDirection * displacementStrength * smoothstep(0.0, 0.3, 1.0 - dissolveMask);
            
            // Subtle swirling only on dissolving edges
            float swirl = fbm(uv * 2.5 + vec2(phaseTime * 0.8, -phaseTime * 0.6));
            float angle = swirl * 0.8; // Reduced rotation
            mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
            displacement += (rotation * direction) * displacementStrength * 0.25;
            
            // Sample texture with displacement
            vec2 sampleUV = uv + displacement;
            vec4 color = texture2D(u_image, sampleUV);
            
            // Multi-sample for motion blur effect on dissolving edges (reduced blur)
            vec4 blurColor = color;
            if(dissolveMask < 0.7 && dissolveMask > 0.3) {
              for(int i = 1; i <= 2; i++) {
                float offset = float(i) * 0.01;
                vec2 blurUV = uv + displacement * (1.0 + offset);
                blurColor += texture2D(u_image, blurUV);
              }
              blurColor /= 3.0;
              color = mix(color, blurColor, 0.4);
            }
            
            // Only fade during active dissolution/materialization
            float fadeStart = dissolutionProgress - 0.3;
            float fadeEnd = dissolutionProgress + 0.6;
            float fadeMask = 1.0 - smoothstep(fadeStart, fadeEnd, dist);
            
            // Prevent dimming in untouched areas
            fadeMask = max(fadeMask, dissolveMask);
            
            // Edge detection for glow
            float edgeDetect = abs(dissolveMask - 0.5) * 2.0;
            float edge = smoothstep(0.5, 1.0, 1.0 - edgeDetect);
            
            // Animated glow on dissolving edges
            float glowPulse = sin(phaseTime * 8.0 + dist * 6.0) * 0.3 + 0.7;
            float edgeGlow = edge * glowPulse * 0.6;
            
            // Wispy smoke particles (consistent direction)
            float particles = 0.0;
            for(int i = 0; i < 3; i++) {
              float fi = float(i);
              vec2 particlePos = uv * (5.0 + fi * 2.0) + direction * phaseTime * (2.0 + fi * 0.3);
              particles += pow(noise(particlePos), 3.5) * (1.0 - dissolveMask) * 0.25;
            }
            
            // Combine all alpha effects
            float finalAlpha = color.a * dissolveMask * fadeMask;
            finalAlpha = clamp(finalAlpha, 0.0, 1.0);
            
            // Enhanced color with smoke effects
            vec3 smokeColor = vec3(0.95, 0.95, 1.0); // Slight blue tint for smoke
            color.rgb = mix(color.rgb, smokeColor, particles * 0.4);
            
            // Brighten edges dramatically
            color.rgb += edgeGlow * vec3(1.2, 1.2, 1.3) * (1.0 - dissolveMask);
            
            // Add depth with subtle darkening on outer particles
            float depth = smoothstep(0.0, 1.0, 1.0 - dissolveMask);
            color.rgb *= mix(1.0, 0.7, depth * 0.3);
            
            color.a = finalAlpha;
            
            gl_FragColor = color;
          }
        `;
      }
      
      // Fallback to holographic if needed
      if (shaderEffect === 'holographic') {
        return `
          precision highp float;
          uniform sampler2D u_image;
          uniform float u_time;
          varying vec2 v_texCoord;
          
          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }
          
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }
          
          vec3 hsv2rgb(vec3 c) {
            vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
            vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
            return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
          }
          
          void main() {
            vec2 uv = v_texCoord;
            float t = u_time * 0.3;
            vec2 center = vec2(0.5, 0.5);
            float dist = distance(uv, center);
            
            // Flowing holographic distortion
            float angle = atan(uv.y - 0.5, uv.x - 0.5);
            float wave1 = sin(dist * 15.0 - t * 2.0 + angle * 3.0) * 0.008;
            float wave2 = cos(angle * 5.0 + t * 1.5) * 0.006;
            
            vec2 distortedUV = uv + vec2(wave1, wave2);
            vec4 color = texture2D(u_image, distortedUV);
            
            // Iridescent color shift
            float hueShift = sin(dist * 8.0 - t + angle * 2.0) * 0.15 + 0.55;
            vec3 rainbow = hsv2rgb(vec3(hueShift, 0.6, 1.0));
            
            // Sparkle overlay
            float sparkle = pow(noise(uv * 30.0 + t * 2.0), 3.0) * 0.4;
            
            // Smooth edge glow
            float edgeMask = smoothstep(0.0, 0.2, dist) * smoothstep(0.8, 0.5, dist);
            vec3 holographicGlow = rainbow * edgeMask * 0.4;
            
            // Pulse effect
            float pulse = sin(t * 2.5) * 0.15 + 1.0;
            
            color.rgb = color.rgb * pulse + holographicGlow + vec3(sparkle);
            
            gl_FragColor = color;
          }
        `;
      }
      
      // Liquid Metal Effect - Chrome-like flowing reflections
      if (shaderEffect === 'liquid') {
        return `
          precision highp float;
          uniform sampler2D u_image;
          uniform float u_time;
          varying vec2 v_texCoord;
          
          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }
          
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }
          
          void main() {
            vec2 uv = v_texCoord;
            float t = u_time * 0.4;
            vec2 center = vec2(0.5, 0.5);
            
            // Liquid flow distortion
            float flow1 = sin(uv.x * 8.0 + t) * cos(uv.y * 6.0 - t * 0.7) * 0.015;
            float flow2 = cos(uv.x * 6.0 - t * 0.8) * sin(uv.y * 8.0 + t * 1.2) * 0.015;
            
            vec2 distortedUV = uv + vec2(flow1, flow2);
            vec4 color = texture2D(u_image, distortedUV);
            
            // Metallic reflection highlights
            float reflectionNoise = noise(uv * 4.0 + vec2(t * 0.5, -t * 0.3));
            float reflection = pow(reflectionNoise, 2.0) * 1.5;
            
            // Chrome streaks
            float streak = sin((uv.x + uv.y) * 10.0 + t * 3.0) * 0.5 + 0.5;
            streak = pow(streak, 4.0) * 0.6;
            
            // Smooth lighting
            float dist = distance(uv, center);
            float lighting = 1.0 - dist * 0.5;
            
            color.rgb = color.rgb * lighting + vec3(reflection + streak);
            
            gl_FragColor = color;
          }
        `;
      }
      
      // Crystalline Effect - Faceted gem-like appearance
      if (shaderEffect === 'crystalline') {
        return `
          precision highp float;
          uniform sampler2D u_image;
          uniform float u_time;
          varying vec2 v_texCoord;
          
          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }
          
          void main() {
            vec2 uv = v_texCoord;
            float t = u_time * 0.25;
            vec2 center = vec2(0.5, 0.5);
            
            // Hexagonal grid for crystal facets
            float angle = atan(uv.y - 0.5, uv.x - 0.5);
            float radius = length(uv - center);
            
            // Create faceted appearance
            float facets = floor(angle / 0.5235) * 0.5235; // 30 degree segments
            float facetOffset = sin(facets * 3.0 + t) * 0.02;
            
            vec2 distortedUV = uv + vec2(
              cos(facets) * facetOffset,
              sin(facets) * facetOffset
            );
            
            vec4 color = texture2D(u_image, distortedUV);
            
            // Crystal light refraction
            float refraction = abs(sin(facets * 6.0 + radius * 10.0 - t * 2.0)) * 0.4;
            
            // Inner glow
            float innerGlow = exp(-radius * 3.0) * 0.5;
            
            // Edge highlights
            float edgeHighlight = smoothstep(0.45, 0.55, radius) * 0.8;
            
            // Sparkle points
            float sparkle = pow(hash(vec2(facets, radius * 10.0 + t)), 8.0) * 2.0;
            
            color.rgb = color.rgb + vec3(refraction + innerGlow + edgeHighlight + sparkle);
            
            gl_FragColor = color;
          }
        `;
      }
      
      // Energy Field Effect - Pulsing electromagnetic waves
      if (shaderEffect === 'energy') {
        return `
          precision highp float;
          uniform sampler2D u_image;
          uniform float u_time;
          varying vec2 v_texCoord;
          
          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }
          
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }
          
          void main() {
            vec2 uv = v_texCoord;
            float t = u_time * 0.5;
            vec2 center = vec2(0.5, 0.5);
            float dist = distance(uv, center);
            
            // Energy wave pulses
            float wave1 = sin(dist * 25.0 - t * 4.0) * 0.5 + 0.5;
            float wave2 = sin(dist * 15.0 - t * 3.0 + 1.5) * 0.5 + 0.5;
            float wave3 = sin(dist * 35.0 - t * 5.0 + 3.0) * 0.5 + 0.5;
            
            float energy = (wave1 + wave2 + wave3) / 3.0;
            energy = pow(energy, 3.0) * 0.15;
            
            // Distortion field
            float angle = atan(uv.y - 0.5, uv.x - 0.5);
            vec2 distortion = vec2(
              cos(angle + t) * energy * 0.3,
              sin(angle + t) * energy * 0.3
            );
            
            vec2 distortedUV = uv + distortion;
            vec4 color = texture2D(u_image, distortedUV);
            
            // Electric blue glow
            vec3 energyColor = vec3(0.3, 0.7, 1.0);
            float glowIntensity = pow(energy, 0.5) * 2.0;
            
            // Particle field
            float particles = noise(uv * 20.0 + t * 2.0) * energy * 1.5;
            
            color.rgb = color.rgb + energyColor * glowIntensity + vec3(particles);
            
            // Outer aura
            float aura = exp(-dist * 2.0) * sin(t * 3.0) * 0.2 + 0.3;
            color.rgb += energyColor * aura * 0.4;
            
            gl_FragColor = color;
          }
        `;
      }
      
      // Chromatic Aberration Effect - RGB split with depth
      if (shaderEffect === 'chromatic') {
        return `
          precision highp float;
          uniform sampler2D u_image;
          uniform float u_time;
          varying vec2 v_texCoord;
          
          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }
          
          void main() {
            vec2 uv = v_texCoord;
            float t = u_time * 0.4;
            vec2 center = vec2(0.5, 0.5);
            float dist = distance(uv, center);
            
            // Animated chromatic aberration
            float aberration = sin(t * 2.0) * 0.008 + 0.012;
            float angle = atan(uv.y - 0.5, uv.x - 0.5);
            
            vec2 direction = normalize(uv - center);
            
            // Sample RGB channels separately
            float r = texture2D(u_image, uv + direction * aberration).r;
            float g = texture2D(u_image, uv).g;
            float b = texture2D(u_image, uv - direction * aberration).b;
            
            vec4 color = vec4(r, g, b, 1.0);
            
            // Depth-based blur simulation
            float depthWave = sin(dist * 20.0 - t * 3.0) * 0.5 + 0.5;
            float blur = depthWave * 0.01;
            
            // Add blur samples
            vec3 blurColor = vec3(0.0);
            for(float i = -2.0; i <= 2.0; i += 1.0) {
              for(float j = -2.0; j <= 2.0; j += 1.0) {
                vec2 offset = vec2(i, j) * blur * 0.002;
                blurColor += texture2D(u_image, uv + offset).rgb;
              }
            }
            blurColor /= 25.0;
            
            color.rgb = mix(color.rgb, blurColor, depthWave * 0.3);
            
            // Prismatic glow
            vec3 prism = vec3(r, g, b) * 0.3;
            color.rgb += prism * (1.0 - dist) * 0.4;
            
            // Vignette
            float vignette = smoothstep(0.8, 0.2, dist);
            color.rgb *= vignette * 0.5 + 0.5;
            
            gl_FragColor = color;
          }
        `;
      }
      
      return '';
    };

    const fsSource = getFragmentShader();

    function createShader(gl: WebGLRenderingContext, type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
    const imageLocation = gl.getUniformLocation(program, 'u_image');
    const timeLocation = gl.getUniformLocation(program, 'u_time');

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 1, 1, 1, 0, 0,
      0, 0, 1, 1, 1, 0,
    ]), gl.STATIC_DRAW);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      // Resize canvas to match image aspect ratio
      const aspectRatio = image.width / image.height;
      const maxSize = 300;
      
      if (aspectRatio > 1) {
        // Wider than tall
        canvas.width = maxSize;
        canvas.height = maxSize / aspectRatio;
      } else {
        // Taller than wide
        canvas.height = maxSize;
        canvas.width = maxSize * aspectRatio;
      }
      
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      
      const startTime = Date.now();
      
      const render = () => {
        if (!isVisible) return;
        
        const currentTime = (Date.now() - startTime) * 0.001;
        
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.useProgram(program);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
        
        gl.uniform1i(imageLocation, 0);
        gl.uniform1f(timeLocation, currentTime);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        
        animationRef.current = requestAnimationFrame(render);
      };
      
      render();
    };
    
    image.src = imageSrc;

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isVisible, imageSrc, shaderEffect]);

  if (!isVisible) return null;

  return (
    <div className={`${styles.loadingScreen} ${isAnimatingOut ? styles.fadeOut : ''}`}>
      <div className={styles.content}>
        <div className={styles.logoContainer}>
          {imageSrc ? (
            <canvas 
              ref={canvasRef} 
              className={styles.shaderCanvas}
              width={300}
              height={300}
            />
          ) : (
            <div className={styles.stonePulse}>
              <div className={styles.stoneCircle}></div>
              <div className={styles.stoneCircle}></div>
              <div className={styles.stoneCircle}></div>
            </div>
          )}
          
          <h1 className={styles.brand}>Shila Murthi</h1>
          <p className={styles.tagline}>Timeless Stone Craftsmanship</p>
        </div>

        <div className={styles.decorativePattern}>
          <div className={styles.patternLine}></div>
          <div className={styles.patternDot}></div>
          <div className={styles.patternLine}></div>
        </div>
      </div>
    </div>
  );
}

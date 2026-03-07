'use client';

import React, { useEffect, useState, useRef } from 'react';
import styles from './PaymentProcessingScreen.module.css';

export default function PaymentProcessingScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  
  const [imageList] = useState<string[]>([
    '/loading-animations/Ganesha art white.png',
    '/loading-animations/Godess-lakshmi white.png',
    '/loading-animations/Iravathlineart white.png',
    '/loading-animations/Lions head art white.png',
    '/loading-animations/Nandhi white.png',
    '/loading-animations/peacock art white.png',
    '/loading-animations/Snakeart white.png',
    '/loading-animations/templefront-white.png'
  ]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loadedImages, setLoadedImages] = useState<HTMLImageElement[]>([]);
  const startTimeRef = useRef<number>(0);
  const textureRef = useRef<WebGLTexture | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const lastPhaseIndexRef = useRef<number>(-1);
  const PHASE_DURATION = 1.5;
  
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const textAnimationRef = useRef<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // FIX M1: Add timeout so user isn't trapped indefinitely if payment flow fails silently
  useEffect(() => {
    const timeout = setTimeout(() => {
      setTimedOut(true);
    }, 120000); // 2 minutes
    return () => clearTimeout(timeout);
  }, []);

  // Prevent scrolling when payment processing screen is active (keep scrollbar visible)
  useEffect(() => {
    // Store the current scroll position
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    
    // Prevent scroll via wheel (mouse scroll)
    const preventScroll = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
    
    // Prevent scroll and restore position
    const preventScrollRestore = () => {
      window.scrollTo(scrollX, scrollY);
    };
    
    // Prevent keyboard scrolling (arrow keys, space, page up/down, home, end)
    const preventKeyboardScroll = (e: KeyboardEvent) => {
      const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', ' ', 'PageUp', 'PageDown', 'Home', 'End'];
      if (keys.includes(e.key) || e.keyCode === 32) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };
    
    // Prevent touch scrolling (mobile)
    const preventTouchScroll = (e: TouchEvent) => {
      if (e.touches.length > 1) return; // Allow pinch zoom
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
    
    // Add event listeners with passive: false to allow preventDefault
    document.addEventListener('wheel', preventScroll, { passive: false });
    document.addEventListener('touchmove', preventTouchScroll, { passive: false });
    document.addEventListener('scroll', preventScrollRestore, { passive: false });
    document.addEventListener('keydown', preventKeyboardScroll, { passive: false });
    
    return () => {
      // Remove all event listeners
      document.removeEventListener('wheel', preventScroll);
      document.removeEventListener('touchmove', preventTouchScroll);
      document.removeEventListener('scroll', preventScrollRestore);
      document.removeEventListener('keydown', preventKeyboardScroll);
    };
  }, []);

  useEffect(() => {
    const loadImages = async () => {
      try {
        const images = await Promise.all(
          imageList.map((path) => {
            return new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = path;
            });
          })
        );
        setLoadedImages(images);
      } catch (error) {
        console.error('Error loading images:', error);
      }
    };

    loadImages();
  }, [imageList]);

  useEffect(() => {
    if (imageList.length === 0 || loadedImages.length === 0) return;

    if (startTimeRef.current === 0) {
      startTimeRef.current = Date.now();
    }

    const phaseTracker = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) * 0.001 * 1.2;
      const phaseIndex = Math.floor(elapsed / PHASE_DURATION);
      
      if (phaseIndex === lastPhaseIndexRef.current) return;
      
      lastPhaseIndexRef.current = phaseIndex;
      
      const isStartOfMaterializePhase = phaseIndex % 2 === 0;
      
      if (isStartOfMaterializePhase) {
        const cycleIndex = Math.floor(phaseIndex / 2);
        const newImageIndex = cycleIndex % imageList.length;
        
        if (newImageIndex !== currentImageIndex) {
          setCurrentImageIndex(newImageIndex);
        }
      }
    }, 50);

    return () => clearInterval(phaseTracker);
  }, [imageList, loadedImages, currentImageIndex, PHASE_DURATION]);

  useEffect(() => {
    if (loadedImages.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { 
      alpha: true, 
      premultipliedAlpha: false,
      antialias: true,
      preserveDrawingBuffer: true
    });
    if (!gl) {
      console.warn('WebGL not supported');
      return;
    }
    
    glRef.current = gl;

    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fsSource = `
      precision highp float;
      uniform sampler2D u_image;
      uniform float u_time;
      varying vec2 v_texCoord;
      
      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.13);
        p3 += dot(p3, p3.yzx + 19.19);
        return fract((p3.x + p3.y) * p3.z);
      }
      
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        
        float a = hash(i + vec2(0.0, 0.0));
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      
      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        
        for(int i = 0; i < 6; i++) {
          value += amplitude * noise(p * frequency);
          frequency *= 2.3;
          amplitude *= 0.5;
        }
        return value;
      }
      
      float voronoi(vec2 p) {
        vec2 n = floor(p);
        vec2 f = fract(p);
        float minDist = 1.0;
        
        for(int j = -1; j <= 1; j++) {
          for(int i = -1; i <= 1; i++) {
            vec2 neighbor = vec2(float(i), float(j));
            vec2 point = hash(n + neighbor) * vec2(1.0, 1.0);
            vec2 diff = neighbor + point - f;
            float dist = length(diff);
            minDist = min(minDist, dist);
          }
        }
        return minDist;
      }
      
      void main() {
        vec2 uv = v_texCoord;
        float t = u_time * 1.2;
        
        vec4 originalColor = texture2D(u_image, uv);
        
        float phaseDuration = 1.5;
        float phaseIndex = floor(t / phaseDuration);
        float phaseTime = fract(t / phaseDuration);
        
        float seed1 = fract(sin(phaseIndex * 127.43 + 234.56) * 43758.5453);
        float seed2 = fract(sin(phaseIndex * 891.23 + 456.78) * 43758.5453);
        float seed3 = fract(sin(phaseIndex * 567.89 + 123.45) * 43758.5453);
        float seed4 = fract(sin(phaseIndex * 345.67 + 789.12) * 43758.5453);
        
        bool isMaterializing = mod(phaseIndex, 2.0) < 1.0;
        
        vec2 randomOrigin = vec2(seed2, seed3);
        float originBlend = seed4 * 0.6 + 0.2;
        vec2 origin = mix(vec2(0.0, 1.0), randomOrigin, originBlend);
        float dist = length(uv - origin);
        vec2 toPixel = normalize(uv - origin + vec2(0.001));
        
        float dissolutionWave = isMaterializing ? 
          (1.0 - smoothstep(0.0, 0.95, phaseTime)) * 1.8 : 
          smoothstep(0.0, 0.95, phaseTime) * 1.8;
        
        vec2 noiseOffset1 = vec2(seed1 * 100.0, seed2 * 100.0);
        vec2 noiseOffset2 = vec2(seed3 * 100.0, seed4 * 100.0);
        vec2 noiseOffset3 = vec2(seed2 * 50.0, seed1 * 50.0);
        
        float dissolveNoise = fbm(uv * 5.0 + phaseTime * 0.5 + noiseOffset1);
        float detailNoise = fbm(uv * 12.0 - phaseTime * 0.8 + noiseOffset2);
        float microDetail = noise(uv * 25.0 + phaseTime * 1.2 + noiseOffset3);
        float noisePattern = dissolveNoise * 0.5 + detailNoise * 0.3 + microDetail * 0.2;
        
        float threshold = dist - dissolutionWave;
        threshold += noisePattern * 0.4;
        
        float alpha = smoothstep(-0.1, 0.3, threshold);
        float imageAlpha = alpha;
        
        float smokeAngle = seed1 * 6.28318;
        vec2 smokeDirection = vec2(cos(smokeAngle), sin(smokeAngle)) * 0.2;
        
        float smokeDensity = 0.0;
        float dissolveEdge = 1.0 - alpha;
        
        if(dissolveEdge > 0.01) {
          vec2 smokeFlow = vec2(
            sin(phaseTime * 1.2 + uv.x * 3.0 + seed2 * 10.0) * 0.3,
            -phaseTime * 2.0
          ) + smokeDirection;
          
          for(int i = 0; i < 4; i++) {
            float fi = float(i);
            float scale = 3.0 + fi * 2.5;
            float speed = 1.0 + fi * 0.4;
            
            vec2 smokePos = uv * scale + smokeFlow * speed + toPixel * phaseTime * (0.5 + fi * 0.2) + noiseOffset1 * 0.5;
            float smokeTurb = fbm(smokePos + phaseTime * 0.5 + noiseOffset2 * 0.3);
            float smokeCell = voronoi(smokePos * 0.8);
            smokeCell = 1.0 - smoothstep(0.0, 0.4, smokeCell);
            float layerSmoke = smokeTurb * 0.6 + smokeCell * 0.4;
            layerSmoke = pow(layerSmoke, 2.0);
            smokeDensity += layerSmoke * (0.25 / (fi + 1.0));
          }
          
          smokeDensity *= dissolveEdge;
          
          float tendrils = 0.0;
          for(int j = 0; j < 3; j++) {
            float fj = float(j);
            vec2 tendrilPos = uv * (8.0 + fj * 4.0) + toPixel * phaseTime * (2.0 + fj * 0.5) + noiseOffset3 * 0.6;
            tendrilPos.y -= phaseTime * (1.5 + fj * 0.3);
            float tendril = pow(noise(tendrilPos + noiseOffset1), 4.0);
            tendrils += tendril * (0.15 / (fj + 1.0));
          }
          
          smokeDensity += tendrils * dissolveEdge;
        }
        
        smokeDensity = clamp(smokeDensity, 0.0, 1.0);
        
        float trailingSmoke = 0.0;
        float hasImageContent = originalColor.a;
        float dissolvingEdge = smoothstep(0.2, 0.5, 1.0 - imageAlpha) * smoothstep(0.9, 0.6, 1.0 - imageAlpha);
        dissolvingEdge *= hasImageContent;
        
        if(dissolvingEdge > 0.05) {
          vec2 smokeFlow = vec2(
            sin(phaseTime * 1.2 + uv.x * 3.0 + seed3 * 10.0) * 0.4,
            -phaseTime * 3.0
          ) + smokeDirection * 0.5;
          
          for(int i = 0; i < 10; i++) {
            float fi = float(i);
            float scale = 3.0 + fi * 1.5;
            vec2 smokeUV = uv * scale + smokeFlow * (1.5 + fi * 0.3) + noiseOffset3 * 0.4;
            float smoke = fbm(smokeUV + noiseOffset1 * 0.2);
            smoke = smoothstep(0.4, 0.7, smoke);
            trailingSmoke += smoke * dissolvingEdge * 0.5;
          }
          
          for(int t = 0; t < 6; t++) {
            float ft = float(t);
            vec2 trailUV = uv * (5.0 + ft * 1.5) + smokeFlow * (2.0 + ft * 0.4) + noiseOffset2 * 0.5;
            float trail = noise(trailUV + noiseOffset3);
            trail = pow(trail, 2.0);
            trailingSmoke += trail * dissolvingEdge * 0.4;
          }
          
          for(int c = 0; c < 4; c++) {
            float fc = float(c);
            vec2 cloudUV = (uv + smokeFlow * 0.5) * (2.5 + fc) + noiseOffset1 * 0.3;
            float cloud = fbm(cloudUV + noiseOffset2 * 0.2);
            cloud = smoothstep(0.35, 0.75, cloud);
            trailingSmoke += cloud * dissolvingEdge * 0.45;
          }
        }
        
        trailingSmoke *= 1.8;
        trailingSmoke = clamp(trailingSmoke, 0.0, 1.0);
        
        float edgeGlow = 0.0;
        float edgeRange = abs(alpha - 0.5) * 2.0;
        if(edgeRange < 0.5) {
          float glowPulse = sin(phaseTime * 6.0 + dist * 8.0) * 0.4 + 0.6;
          edgeGlow = (1.0 - edgeRange * 2.0) * glowPulse * 0.5;
        }
        
        vec3 smokeColor = vec3(1.0, 1.0, 1.0);
        vec3 glowColor = vec3(1.0, 1.0, 1.05);
        vec3 particleSmokeColor = vec3(0.9, 0.92, 0.95);
        vec3 smokeLayer = mix(smokeColor, particleSmokeColor, smokeDensity * 0.3);
        smokeLayer = mix(smokeLayer, smokeColor, trailingSmoke);
        smokeLayer += glowColor * edgeGlow * 0.5;
        
        vec3 finalColor = mix(smokeLayer, originalColor.rgb, imageAlpha);
        float smokeContribution = trailingSmoke * (1.0 - imageAlpha) * originalColor.a;
        float finalAlpha = originalColor.a * imageAlpha + smokeContribution;
        finalAlpha = clamp(finalAlpha, 0.0, 1.0);
        
        gl_FragColor = vec4(finalColor, finalAlpha);
      }
    `;

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
    
    textureRef.current = texture;

    const loadAndRenderImage = (imgElement: HTMLImageElement) => {
      const aspectRatio = imgElement.width / imgElement.height;
      const maxSize = 600;
      
      if (aspectRatio > 1) {
        canvas.width = maxSize;
        canvas.height = maxSize / aspectRatio;
      } else {
        canvas.height = maxSize;
        canvas.width = maxSize * aspectRatio;
      }
      
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgElement);
    };

    if (startTimeRef.current === 0) {
      startTimeRef.current = Date.now();
    }
    loadAndRenderImage(loadedImages[currentImageIndex]);
    
    const render = () => {
      const currentTime = (Date.now() - startTimeRef.current) * 0.001;
        
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

    // WebGL context loss handling
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
    const handleContextRestored = () => {
      // Context restored — no-op; the effect will re-run on next dependency change
      // or the 2-minute timeout will redirect the user
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    canvas.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, [loadedImages]);

  useEffect(() => {
    if (!glRef.current || !textureRef.current || loadedImages.length === 0) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const gl = glRef.current;
    const texture = textureRef.current;
    const image = loadedImages[currentImageIndex];
    
    const aspectRatio = image.width / image.height;
    const maxSize = 600;
    
    if (aspectRatio > 1) {
      canvas.width = maxSize;
      canvas.height = maxSize / aspectRatio;
    } else {
      canvas.height = maxSize;
      canvas.width = maxSize * aspectRatio;
    }
    
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }, [currentImageIndex, loadedImages]);

  useEffect(() => {
    const canvas = textCanvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { 
      alpha: true, 
      premultipliedAlpha: false,
      antialias: true 
    });
    if (!gl) return;

    const textCanvas = document.createElement('canvas');
    const textCtx = textCanvas.getContext('2d');
    if (!textCtx) return;

    textCanvas.width = 800;
    textCanvas.height = 100;
    textCtx.font = 'bold 24px Inter, sans-serif';
    textCtx.fillStyle = 'white';
    textCtx.textAlign = 'center';
    textCtx.textBaseline = 'middle';
    textCtx.letterSpacing = '0.05em';
    textCtx.fillText('Processing your payment...', 400, 50);

    canvas.width = 800;
    canvas.height = 100;

    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;

    const fsSource = `
      precision highp float;
      uniform sampler2D u_image;
      uniform float u_time;
      varying vec2 v_texCoord;
      
      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.13);
        p3 += dot(p3, p3.yzx + 19.19);
        return fract((p3.x + p3.y) * p3.z);
      }
      
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        
        float a = hash(i + vec2(0.0, 0.0));
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      
      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        
        for(int i = 0; i < 6; i++) {
          value += amplitude * noise(p * frequency);
          frequency *= 2.3;
          amplitude *= 0.5;
        }
        return value;
      }
      
      void main() {
        vec2 uv = v_texCoord;
        float t = u_time * 1.2;
        
        vec4 originalColor = texture2D(u_image, uv);
        
        float cycleTime = mod(t, 3.0);
        float normalizedCycle = cycleTime / 3.0;
        
        bool isMaterializing = normalizedCycle < 0.5;
        float phaseProgress = isMaterializing ? (normalizedCycle * 2.0) : ((normalizedCycle - 0.5) * 2.0);
        
        float wave1 = sin(uv.x * 3.0 - t * 2.5) * 0.5 + 0.5;
        float wave2 = sin(uv.x * 5.0 - t * 3.0 + 1.0) * 0.5 + 0.5;
        float wave3 = cos(uv.x * 7.0 - t * 2.0 + 2.0) * 0.5 + 0.5;
        
        float flowPattern = (wave1 + wave2 * 0.5 + wave3 * 0.3) / 1.8;
        
        float flowNoise = fbm(vec2(uv.x * 3.0 + t * 0.5, uv.y * 2.0 - t * 0.3));
        flowNoise = flowNoise * 0.5 + 0.5;
        
        float dripNoise = fbm(vec2(uv.x * 8.0, uv.y * 4.0 + t * 1.5));
        float drip = smoothstep(0.3, 0.7, dripNoise) * 0.3;
        
        float basePosition = (uv.x + flowNoise * 0.2 + drip) * 0.9;
        
        float reveal;
        if (isMaterializing) {
          reveal = smoothstep(phaseProgress - 0.15, phaseProgress + 0.15, basePosition);
        } else {
          reveal = smoothstep(phaseProgress - 0.15, phaseProgress + 0.15, basePosition);
          reveal = 1.0 - reveal;
        }
        
        float edgePosition = isMaterializing ? phaseProgress : phaseProgress;
        float edgeDist = abs(basePosition - edgePosition);
        float edgeGlow = exp(-edgeDist * 15.0) * flowPattern;
        edgeGlow = pow(edgeGlow, 2.0) * 1.5;
        
        float shimmer = noise(vec2(uv.x * 20.0 - t * 4.0, uv.y * 10.0)) * 0.5 + 0.5;
        shimmer = pow(shimmer, 8.0) * edgeGlow;
        
        vec3 inkColor = vec3(0.9, 0.95, 1.0);
        vec3 finalColor = mix(originalColor.rgb, originalColor.rgb + inkColor * 0.4, edgeGlow);
        
        finalColor += vec3(shimmer * 1.5);
        
        float brightness = 1.0 + edgeGlow * 0.6;
        finalColor *= brightness;
        
        gl_FragColor = vec4(finalColor, originalColor.a * reveal);
      }
    `;

    function createShader(gl: WebGLRenderingContext, type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Text shader compile error:', gl.getShaderInfoLog(shader));
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

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);

    const startTime = Date.now();

    const render = () => {
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

      textAnimationRef.current = requestAnimationFrame(render);
    };

    render();

    // WebGL context loss handling
    const handleTextContextLost = (e: Event) => {
      e.preventDefault();
      if (textAnimationRef.current) {
        cancelAnimationFrame(textAnimationRef.current);
        textAnimationRef.current = null;
      }
    };
    const handleTextContextRestored = () => {
      // No-op — text canvas is non-critical
    };
    canvas.addEventListener('webglcontextlost', handleTextContextLost);
    canvas.addEventListener('webglcontextrestored', handleTextContextRestored);

    return () => {
      if (textAnimationRef.current) {
        cancelAnimationFrame(textAnimationRef.current);
      }
      canvas.removeEventListener('webglcontextlost', handleTextContextLost);
      canvas.removeEventListener('webglcontextrestored', handleTextContextRestored);
    };
  }, []);

  return (
    <div className={styles.loadingScreen}>
      <div className={styles.content}>
        <div className={styles.logoContainer}>
          <canvas 
            ref={canvasRef} 
            className={styles.shaderCanvas}
            width={600}
            height={600}
          />
        
          <canvas 
            ref={textCanvasRef} 
            className={styles.taglineCanvas}
            width={800}
            height={100}
          />

          <div className={styles.helpSection}>
            <div className={styles.helpIcon}>
              <button aria-label="Help with payment processing" className={styles.helpButton}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.125rem' }}>help</span>
                <span>Payment taking too long?</span>
              </button>
              <div className={styles.helpTooltip}>
                <p className={styles.tooltipTitle}>Common Issues &amp; FAQs:</p>
                <ul className={styles.tooltipList}>
                  <li>Double-check your internet connection.</li>
                  <li>Ensure payment details are correct.</li>
                  <li>Contact your bank if the issue persists.</li>
                  <li>
                    <a href="#">Visit our help center</a> for more.
                  </li>
                </ul>
                <div className={styles.tooltipArrow}></div>
              </div>
            </div>
            
            <div className={styles.bottomText}>
              {timedOut ? (
                <>
                  <p style={{ color: '#ff9800', fontWeight: 600 }}>
                    This is taking longer than expected.
                  </p>
                  <p>
                    <button
                      onClick={() => window.location.href = '/order-confirmation'}
                      style={{
                        background: 'transparent',
                        border: '1px solid #fff',
                        color: '#fff',
                        padding: '8px 20px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        marginTop: '8px',
                        fontSize: '14px'
                      }}
                    >
                      Check Order Status
                    </button>
                  </p>
                </>
              ) : (
                <>
                  <p>Please do not close this window or press the back button.</p>
                  <p>You will be redirected to the order confirmation page shortly.</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

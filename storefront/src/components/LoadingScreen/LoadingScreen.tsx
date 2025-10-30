'use client';

import React, { useEffect, useState, useRef } from 'react';
import styles from './LoadingScreen.module.css';

export interface LoadingScreenProps {
  show?: boolean;
  onComplete?: () => void;
  duration?: number;
  imageSrc?: string;
  imagesFolder?: string;
  shaderEffect?: 'smoke';
}

export default function LoadingScreen({ 
  show = true, 
  onComplete,
  duration = 1200,
  imageSrc,
  imagesFolder,
  shaderEffect = 'smoke'
}: LoadingScreenProps) {
  const [isVisible, setIsVisible] = useState(show);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  
  const [imageList, setImageList] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [loadedImages, setLoadedImages] = useState<HTMLImageElement[]>([]);
  const startTimeRef = useRef<number>(0);
  const textureRef = useRef<WebGLTexture | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const lastPhaseIndexRef = useRef<number>(-1);
  const PHASE_DURATION = 1.5;

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
    if (!imagesFolder) return;

    const imageFiles = [
      'Ganesha art white.png',
      'Godess-lakshmi white.png',
      'Iravathlineart white.png',
      'Lions head art white.png',
      'Nandhi white.png',
      'peacock art white.png',
      'Snakeart white.png',
      'templefront-white.png'
    ];

    const imagePaths = imageFiles.map(file => `${imagesFolder}/${file}`);
    setImageList(imagePaths);

    const loadImages = async () => {
      const images = await Promise.all(
        imagePaths.map(path => {
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
    };

    loadImages();
  }, [imagesFolder]);

  useEffect(() => {
    if (!imagesFolder || imageList.length === 0 || loadedImages.length === 0) return;

    if (startTimeRef.current === 0) {
      startTimeRef.current = Date.now();
    }

    const phaseTracker = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) * 0.001 * 1.2;
      const phaseIndex = Math.floor(elapsed / PHASE_DURATION);
      
      // Only process when we enter a NEW phase
      if (phaseIndex === lastPhaseIndexRef.current) return;
      
      lastPhaseIndexRef.current = phaseIndex;
      
      // Each complete cycle = 2 phases (materialize + dissolve)
      // Change image only at START of materialize phases (even phaseIndex)
      const isStartOfMaterializePhase = phaseIndex % 2 === 0;
      
      if (isStartOfMaterializePhase) {
        // Which image should show in this cycle
        const cycleIndex = Math.floor(phaseIndex / 2); // Each cycle = 2 phases
        const newImageIndex = cycleIndex % imageList.length;
        
        if (newImageIndex !== currentImageIndex) {
          setCurrentImageIndex(newImageIndex);
        }
      }
    }, 50);

    return () => clearInterval(phaseTracker);
  }, [imagesFolder, imageList, loadedImages, currentImageIndex, PHASE_DURATION]);

  useEffect(() => {
    if (!isVisible) return;
    
    const isMultiImageMode = imagesFolder && loadedImages.length > 0;
    const isSingleImageMode = imageSrc && !isMultiImageMode;
    
    if (!isMultiImageMode && !isSingleImageMode) return;

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

    const getFragmentShader = () => {
      // Natural Smoke Dissolution Effect - Particle-based, no stretching
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
            vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
            
            float a = hash(i + vec2(0.0, 0.0));
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            
            return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
          }
          
          // FBM for smoke turbulence
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
          
          // Voronoi-like cells for smoke pockets
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
            
            // Sample original image without any distortion
            vec4 originalColor = texture2D(u_image, uv);
            
            // Random disintegrate/form pattern - each phase lasts 1.5 seconds
            float phaseDuration = 1.5;
            float phaseIndex = floor(t / phaseDuration);
            float phaseTime = fract(t / phaseDuration);
            
            // Multiple random seeds for true variation per phase
            float seed1 = fract(sin(phaseIndex * 127.43 + 234.56) * 43758.5453);
            float seed2 = fract(sin(phaseIndex * 891.23 + 456.78) * 43758.5453);
            float seed3 = fract(sin(phaseIndex * 567.89 + 123.45) * 43758.5453);
            float seed4 = fract(sin(phaseIndex * 345.67 + 789.12) * 43758.5453);
            
            // Alternate between materializing and dissolving for smooth rhythm
            // This ensures no sudden pops between phases
            bool isMaterializing = mod(phaseIndex, 2.0) < 1.0;
            
            // Randomize the origin point for MAXIMUM variety
            vec2 randomOrigin = vec2(seed2, seed3);
            
            // Also randomize the blend amount for more variation
            float originBlend = seed4 * 0.6 + 0.2; // Between 0.2 and 0.8
            
            vec2 origin = mix(vec2(0.0, 1.0), randomOrigin, originBlend);
            float dist = length(uv - origin);
            vec2 toPixel = normalize(uv - origin + vec2(0.001));
            
            // Dissolution wave moving outward from corner
            // Using full phaseTime range (0.0 to 1.0) for complete transitions
            float dissolutionWave = isMaterializing ? 
              (1.0 - smoothstep(0.0, 0.95, phaseTime)) * 1.8 : 
              smoothstep(0.0, 0.95, phaseTime) * 1.8;
            
            // Random noise offsets per phase for unique patterns (ONLY for smoke, not image)
            vec2 noiseOffset1 = vec2(seed1 * 100.0, seed2 * 100.0);
            vec2 noiseOffset2 = vec2(seed3 * 100.0, seed4 * 100.0);
            vec2 noiseOffset3 = vec2(seed2 * 50.0, seed1 * 50.0);
            
            // Noise pattern for organic dissolve (ORIGINAL animation behavior)
            float dissolveNoise = fbm(uv * 5.0 + phaseTime * 0.5 + noiseOffset1);
            float detailNoise = fbm(uv * 12.0 - phaseTime * 0.8 + noiseOffset2);
            float microDetail = noise(uv * 25.0 + phaseTime * 1.2 + noiseOffset3);
            float noisePattern = dissolveNoise * 0.5 + detailNoise * 0.3 + microDetail * 0.2;
            
            // ORIGINAL ALPHA CALCULATION - with full noise for organic dissolve
            float threshold = dist - dissolutionWave;
            threshold += noisePattern * 0.4; // RESTORED original noise intensity
            
            // Smooth alpha transition
            float alpha = smoothstep(-0.1, 0.3, threshold);
            
            // Image visibility - original animation behavior
            float imageAlpha = alpha;
            
            // Random smoke direction for each phase (declared here for use in multiple sections)
            float smokeAngle = seed1 * 6.28318; // Random angle in radians
            vec2 smokeDirection = vec2(cos(smokeAngle), sin(smokeAngle)) * 0.2;
            
            // --- Smoke Particle Layer (separate from image) ---
            
            // Create floating smoke where image is dissolving
            float smokeDensity = 0.0;
            float dissolveEdge = 1.0 - alpha; // Inverse of image alpha
            
            if(dissolveEdge > 0.01) {
              
              // Rising smoke motion with random variation
              vec2 smokeFlow = vec2(
                sin(phaseTime * 1.2 + uv.x * 3.0 + seed2 * 10.0) * 0.3,
                -phaseTime * 2.0  // Upward drift
              ) + smokeDirection;
              
              // Multiple smoke layers at different scales
              for(int i = 0; i < 4; i++) {
                float fi = float(i);
                float scale = 3.0 + fi * 2.5;
                float speed = 1.0 + fi * 0.4;
                
                vec2 smokePos = uv * scale + smokeFlow * speed + toPixel * phaseTime * (0.5 + fi * 0.2) + noiseOffset1 * 0.5;
                
                // Turbulent smoke with random offset
                float smokeTurb = fbm(smokePos + phaseTime * 0.5 + noiseOffset2 * 0.3);
                
                // Voronoi cells for puffy smoke clouds
                float smokeCell = voronoi(smokePos * 0.8);
                smokeCell = 1.0 - smoothstep(0.0, 0.4, smokeCell);
                
                // Combine turbulence and cells
                float layerSmoke = smokeTurb * 0.6 + smokeCell * 0.4;
                layerSmoke = pow(layerSmoke, 2.0);
                
                // Add to total with falloff
                smokeDensity += layerSmoke * (0.25 / (fi + 1.0));
              }
              
              // Smoke appears at dissolving edges
              smokeDensity *= dissolveEdge;
              
              // Add wispy tendrils with random variation
              float tendrils = 0.0;
              for(int j = 0; j < 3; j++) {
                float fj = float(j);
                vec2 tendrilPos = uv * (8.0 + fj * 4.0) + toPixel * phaseTime * (2.0 + fj * 0.5) + noiseOffset3 * 0.6;
                tendrilPos.y -= phaseTime * (1.5 + fj * 0.3); // Rise upward
                
                float tendril = pow(noise(tendrilPos + noiseOffset1), 4.0);
                tendrils += tendril * (0.15 / (fj + 1.0));
              }
              
              smokeDensity += tendrils * dissolveEdge;
            }
            
            // Clamp smoke density
            smokeDensity = clamp(smokeDensity, 0.0, 1.0);
            
            // --- Trailing White Smoke (Natural & Wispy) ---
            float trailingSmoke = 0.0;
            
            // ONLY create smoke where original image had content (non-transparent)
            // This prevents smoke appearing in transparent PNG areas
            float hasImageContent = originalColor.a; // 0 = transparent, 1 = has content
            
            // Smoke appears at the EDGE where dissolution is happening
            // Detect the transition zone (not the fully dissolved area)
            float dissolvingEdge = smoothstep(0.2, 0.5, 1.0 - imageAlpha) * smoothstep(0.9, 0.6, 1.0 - imageAlpha);
            
            // Only show smoke where there was actual image content
            dissolvingEdge *= hasImageContent;
            
            if(dissolvingEdge > 0.05) {
              // Upward smoke flow with random variation per phase
              vec2 smokeFlow = vec2(
                sin(phaseTime * 1.2 + uv.x * 3.0 + seed3 * 10.0) * 0.4,
                -phaseTime * 3.0 // Strong upward
              ) + smokeDirection * 0.5;
              
              // Create HEAVY billowing smoke (more layers, lower threshold)
              for(int i = 0; i < 10; i++) {
                float fi = float(i);
                float scale = 3.0 + fi * 1.5;
                
                vec2 smokeUV = uv * scale + smokeFlow * (1.5 + fi * 0.3) + noiseOffset3 * 0.4;
                
                // Heavy smoke pattern with random offset
                float smoke = fbm(smokeUV + noiseOffset1 * 0.2);
                
                // LOWER threshold = more dense smoke
                smoke = smoothstep(0.4, 0.7, smoke);
                
                // MUCH STRONGER contribution per layer
                trailingSmoke += smoke * dissolvingEdge * 0.5;
              }
              
              // Add thick flowing smoke trails
              for(int t = 0; t < 6; t++) {
                float ft = float(t);
                vec2 trailUV = uv * (5.0 + ft * 1.5) + smokeFlow * (2.0 + ft * 0.4) + noiseOffset2 * 0.5;
                
                float trail = noise(trailUV + noiseOffset3);
                trail = pow(trail, 2.0); // Thicker trails
                
                trailingSmoke += trail * dissolvingEdge * 0.4;
              }
              
              // Add large billowing clouds for heaviness
              for(int c = 0; c < 4; c++) {
                float fc = float(c);
                vec2 cloudUV = (uv + smokeFlow * 0.5) * (2.5 + fc) + noiseOffset1 * 0.3;
                
                float cloud = fbm(cloudUV + noiseOffset2 * 0.2);
                cloud = smoothstep(0.35, 0.75, cloud);
                
                trailingSmoke += cloud * dissolvingEdge * 0.45;
              }
            }
            
            // BOOST final smoke intensity significantly
            trailingSmoke *= 1.8;
            trailingSmoke = clamp(trailingSmoke, 0.0, 1.0);
            
            // --- Edge glow effect ---
            float edgeGlow = 0.0;
            float edgeRange = abs(alpha - 0.5) * 2.0;
            if(edgeRange < 0.5) {
              float glowPulse = sin(phaseTime * 6.0 + dist * 8.0) * 0.4 + 0.6;
              edgeGlow = (1.0 - edgeRange * 2.0) * glowPulse * 0.5;
            }
            
            // --- Final composition: Image REPLACED by smoke ---
            
            // White smoke color
            vec3 smokeColor = vec3(1.0, 1.0, 1.0);
            vec3 glowColor = vec3(1.0, 1.0, 1.05);
            
            // Create smoke layer with particle effects
            vec3 particleSmokeColor = vec3(0.9, 0.92, 0.95);
            vec3 smokeLayer = mix(smokeColor, particleSmokeColor, smokeDensity * 0.3);
            smokeLayer = mix(smokeLayer, smokeColor, trailingSmoke);
            
            // Add edge glow to smoke
            smokeLayer += glowColor * edgeGlow * 0.5;
            
            // CROSS-FADE: Image fades out, smoke fades in (they replace each other)
            vec3 finalColor = mix(smokeLayer, originalColor.rgb, imageAlpha);
            
            // Alpha composition: Use image alpha where image exists, smoke alpha where it doesn't
            // Where imageAlpha is high (1.0) = show image
            // Where imageAlpha is low (0.0) = show smoke
            float smokeContribution = trailingSmoke * (1.0 - imageAlpha) * originalColor.a;
            float finalAlpha = originalColor.a * imageAlpha + smokeContribution;
            finalAlpha = clamp(finalAlpha, 0.0, 1.0);
            
            gl_FragColor = vec4(finalColor, finalAlpha);
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
    
    textureRef.current = texture;

    const loadAndRenderImage = (imgElement: HTMLImageElement) => {
      // Resize canvas to match image aspect ratio with HIGHER RESOLUTION
      const aspectRatio = imgElement.width / imgElement.height;
      const maxSize = 600; // Increased from 300 to 600 for better quality
      
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

    if (isMultiImageMode) {
      if (startTimeRef.current === 0) {
        startTimeRef.current = Date.now();
      }
      loadAndRenderImage(loadedImages[currentImageIndex]);
    }
    
    const render = () => {
      if (!isVisible) return;
      
      const currentTime = isMultiImageMode 
        ? (Date.now() - startTimeRef.current) * 0.001
        : (Date.now() - startTimeRef.current) * 0.001;
        
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

    if (isSingleImageMode) {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        if (startTimeRef.current === 0) {
          startTimeRef.current = Date.now();
        }
        loadAndRenderImage(image);
        render();
      };
      image.src = imageSrc!;
    } else if (isMultiImageMode) {
      render();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isVisible, imageSrc, imagesFolder, loadedImages, shaderEffect]);

  useEffect(() => {
    if (!glRef.current || !textureRef.current || !imagesFolder || loadedImages.length === 0) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const gl = glRef.current;
    const texture = textureRef.current;
    const image = loadedImages[currentImageIndex];
    
    // Resize canvas to match NEW image's aspect ratio with HIGHER RESOLUTION
    const aspectRatio = image.width / image.height;
    const maxSize = 600; // Increased from 300 to 600 for better quality
    
    if (aspectRatio > 1) {
      canvas.width = maxSize;
      canvas.height = maxSize / aspectRatio;
    } else {
      canvas.height = maxSize;
      canvas.width = maxSize * aspectRatio;
    }
    
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }, [currentImageIndex, imagesFolder, loadedImages]);

  if (!isVisible) return null;

  return (
    <div className={`${styles.loadingScreen} ${isAnimatingOut ? styles.fadeOut : ''}`}>
      <div className={styles.content}>
        <div className={styles.logoContainer}>
          {(imageSrc || imagesFolder) ? (
            <canvas 
              ref={canvasRef} 
              className={styles.shaderCanvas}
              width={600}
              height={600}
            />
          ) : (
            <div className={styles.stonePulse}>
              <div className={styles.stoneCircle}></div>
              <div className={styles.stoneCircle}></div>
              <div className={styles.stoneCircle}></div>
            </div>
          )}
        
          <p className={styles.tagline}>Getting things ready for you...</p>
        </div>

      </div>
    </div>
  );
}

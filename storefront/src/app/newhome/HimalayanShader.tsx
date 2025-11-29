'use client';

import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

const fragmentShader = `
  uniform float u_time;
  uniform vec2 u_resolution;

  float random(in vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  float noise(in vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
            (c - a)* u.y * (1.0 - u.x) +
            (d - b) * u.x * u.y;
  }

  #define OCTAVES 3
  float fbm(in vec2 st) {
    float value = 0.0;
    float amplitude = 0.65; // Increased from 0.5 for better visibility
    float frequency = 0.;
    
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));

    for (int i = 0; i < OCTAVES; i++) {
      value += amplitude * noise(st);
      st = rot * st * 2.0 + vec2(100.0, 0.0);
      amplitude *= 0.55; // Increased from 0.5 to retain more detail
    }
    return value;
  }

  float getMountainHeight(float x, float seedOffset, float scale, float roughness) {
    float h = 0.0;
    float amp = 0.5;
    float freq = scale;
    
    for(int i = 0; i < 4; i++) {
      float n = noise(vec2(x * freq + seedOffset, seedOffset));
      float ridge = 1.0 - abs(2.0 * n - 1.0);
      ridge = pow(ridge, 1.1); 
      
      h += ridge * amp;
      freq *= 2.0;
      amp *= roughness * 0.70;
    }
    return h;
  }

  void main() {
    vec2 st = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / u_resolution.y;
    st.x *= aspect;

    vec3 colorEdge = vec3(0.45, 0.75, 0.95); 
    vec3 colorCenter = vec3(0.85, 0.96, 1.0);
    vec3 colorIce = vec3(0.65, 0.88, 0.99);
    vec3 colorMist = vec3(0.95, 0.98, 1.0);
    vec3 colorShadow = vec3(0.10, 0.18, 0.38); 

    vec2 center = vec2(0.5 * aspect, 0.5);
    float dist = distance(st, center);
    float radialGradient = smoothstep(1.4, 0.0, dist);
    vec3 bgBase = mix(colorEdge, colorCenter, radialGradient);

    float leftStructure = noise(vec2(st.x * 3.5, 42.0)); 
    float leftBias = (1.0 - smoothstep(0.1, 1.0, st.x)) * (0.3 + 0.7 * leftStructure);

    float height1 = getMountainHeight(st.x, 85.0, 1.5, 0.45);
    height1 += leftBias * 0.35; 
    height1 = height1 * 1.0 + 0.1; 
    float mask1 = smoothstep(0.01, 0.0, st.y - height1);
    vec3 mtColor1 = mix(colorShadow, bgBase, 0.5); 
    bgBase = mix(bgBase, mtColor1, mask1);

    float height2 = getMountainHeight(st.x, 220.0, 2.8, 0.5);
    height2 += leftBias * 0.30;
    height2 = height2 * 0.75 + 0.05; 
    float mask2 = smoothstep(0.005, 0.0, st.y - height2);
    
    float rockTexture = noise(st * 20.0) * 0.1;
    vec3 mtColor2 = mix(colorShadow, bgBase, 0.2 + rockTexture);
    bgBase = mix(bgBase, mtColor2, mask2);

    float windSpeed = u_time * 0.5; 
    vec2 windDir = vec2(windSpeed * 1.0, -windSpeed * 0.4);

    vec2 q = vec2(0.);
    q.x = fbm( st + windDir * 0.5 );
    q.y = fbm( st + vec2(1.0) + windDir * 0.5);

    vec2 r = vec2(0.);
    r.x = fbm( st + 1.0 * q + vec2(1.7, 9.2) + windDir );
    r.y = fbm( st + 1.0 * q + vec2(8.3, 2.8) + windDir * 0.8);

    float f = fbm((st + r + windDir) * 3.0);

    // === FLOWING SIDE REVEALS - Mountains tease through moving fog ===
    // Normalize x position (0 = left edge, 1 = right edge)
    float normX = st.x / aspect;
    
    // Left side flowing reveal - uses the SAME fog flow patterns
    float leftRegion = smoothstep(0.4, 0.0, normX); // Bias toward left edge
    float leftFlow = fbm(st * 2.5 + windDir * 1.2 + vec2(5.0, 10.0)); // Flows with wind
    float leftReveal = leftRegion * smoothstep(0.3, 0.7, leftFlow); // Reveals when flow is high
    
    // Right side flowing reveal - mirrored, different seed
    float rightRegion = smoothstep(0.6, 1.0, normX); // Bias toward right edge
    float rightFlow = fbm(st * 2.5 + windDir * 1.2 + vec2(50.0, 30.0)); // Different seed, same wind
    float rightReveal = rightRegion * smoothstep(0.3, 0.7, rightFlow); // Reveals when flow is high
    
    // Combine - fog naturally thins on sides as it flows
    float sideReveal = leftReveal + rightReveal;
    // === END FLOWING REVEALS ===

    // Fog mixing - sideReveal creates flowing gaps on sides
    float fogAmount = smoothstep(0.4, 1.0, (f*f)*1.5);
    fogAmount *= (1.0 - sideReveal * 0.6); // Fog thins where flow reveals
    vec3 color = mix(bgBase, colorShadow, fogAmount);
    
    color = mix(color, colorIce, smoothstep(0.2, 0.8, length(q)) * (1.0 - sideReveal * 0.4));

    float mistPattern = pow(r.x, 2.9); // Reduced power for more mist visibility
    float cloudBreak = fbm(st * 0.8 + windDir * 0.5); 
    float structuralHoles = smoothstep(0.3, 0.55, cloudBreak); // Adjusted thresholds

    mistPattern *= structuralHoles;

    float mistAlpha = smoothstep(0.2, 1.9, mistPattern); // Wider range for more visibility

    float heightFade = smoothstep(height1 - 0.4, height1 + 0.4, st.y);
    
    float mistVisibilityFactor = clamp(heightFade + (structuralHoles * 0.7), 0.0, 1.0); // Increased from 0.6
    
    color = mix(color, colorMist, mistAlpha * mistVisibilityFactor * 1.2); // Boosted by 1.2x

    float lightPattern = fbm(st * 3.0 + u_time * 0.1);
    color += colorMist * pow(lightPattern, 3.0) * 0.2; // Reduced power, increased multiplier

    color = pow(color, vec3(1.1)); 
    color *= 1.0 - dist * 0.3;
    color += random(st + u_time) * 0.02;

    // Center fade to transparent for GLB model area (shifted down for ShivaLingam)
    vec2 screenCenter = vec2(0.5 * aspect, 0.42); // Shifted down from 0.5
    float centerDist = distance(st, screenCenter);
    
    // Add organic non-uniformity ONLY to the bottom half
    float angle = atan(st.y - screenCenter.y, st.x - screenCenter.x);
    float noiseOffset = noise(vec2(angle * 3.0, 0.0)) * 0.08;
    noiseOffset += noise(vec2(angle * 7.0, 5.0)) * 0.04;
    
    // Only apply noise when below center (st.y < screenCenter.y)
    float bottomMask = smoothstep(screenCenter.y + 0.05, screenCenter.y - 0.05, st.y);
    noiseOffset *= bottomMask;
    
    float organicDist = centerDist - noiseOffset;
    
    // Fade starts at 0.28 (transparent) and becomes fully opaque at 0.65
    float centerAlpha = smoothstep(0.28, 0.65, organicDist);
    
    // Edge fade on top and bottom only (normalized st without aspect correction)
    vec2 stNorm = gl_FragCoord.xy / u_resolution.xy;
    float edgeFadeSize = 0.12; // Size of fade region on edges
    float bottomFade = smoothstep(0.0, edgeFadeSize, stNorm.y);
    float topFade = smoothstep(1.0, 1.0 - edgeFadeSize, stNorm.y);
    float edgeAlpha = bottomFade * topFade;
    
    // Combine center and edge alpha
    float alpha = centerAlpha * edgeAlpha;

    gl_FragColor = vec4(color, alpha);
  }
`;

export default function HimalayanShader() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const animationIdRef = useRef<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // Setup
    const container = containerRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false });
    renderer.setPixelRatio(1); // Capped to 1 for performance
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0); // Transparent background
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Shader material
    const material = new THREE.ShaderMaterial({
      uniforms: {
        u_time: { value: 0 },
        u_resolution: {
          value: new THREE.Vector2(
            container.clientWidth * renderer.getPixelRatio(),
            container.clientHeight * renderer.getPixelRatio()
          )
        }
      },
      fragmentShader: fragmentShader,
      transparent: true,
    });
    materialRef.current = material;

    // Fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Resize handler
    const handleResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      material.uniforms.u_resolution.value.set(
        width * renderer.getPixelRatio(),
        height * renderer.getPixelRatio()
      );
    };

    window.addEventListener('resize', handleResize);

    // Animation loop
    const animate = () => {
      material.uniforms.u_time.value += 0.015;
      renderer.render(scene, camera);
      animationIdRef.current = requestAnimationFrame(animate);
    };
    animate();

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationIdRef.current);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} className="himalayan-shader-bg" />;
}

/// <reference path="../types/r3f.d.ts" />
'use client';
// This is home page
import React, { useRef, useState, useMemo, Suspense, useEffect } from 'react';
// @ts-ignore
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Center, Environment, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { motion, useScroll, useTransform, useMotionValueEvent, AnimatePresence } from 'framer-motion';
import HimalayanShader from './HimalayanShader';
import IceShineText from './IceShineText';
import WorkshopGallery from './WorkshopGallery';
import IdolScrollGallery from './IdolScrollGallery';

// Mouse position context for 3D scene
const mousePosition = { x: 0, y: 0 };

// Component to handle mouse-based rotation
function MouseRotationGroup({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<THREE.Group>(null);
  const { invalidate } = useThree();

  // Target and current rotation for smooth interpolation
  const targetRotation = useRef({ x: 0, y: 0 });
  const currentRotation = useRef({ x: 0, y: 0 });

  useFrame(() => {
    if (!groupRef.current) return;

    // Map mouse position to rotation angles - noticeable tilt, responsive movement
    targetRotation.current.y = mousePosition.x * 0.5;
    targetRotation.current.x = mousePosition.y * 0.3;

    // Smooth interpolation (lerp) - faster response while staying seamless
    currentRotation.current.x += (targetRotation.current.x - currentRotation.current.x) * 0.1;
    currentRotation.current.y += (targetRotation.current.y - currentRotation.current.y) * 0.1;

    // Apply rotation
    groupRef.current.rotation.x = currentRotation.current.x;
    groupRef.current.rotation.y = currentRotation.current.y;
  });

  return React.createElement('group' as any, { ref: groupRef }, children);
}

function ShivaLingaModel({ ...props }) {
  const { scene } = useGLTF('/shivalingamdepth-mesh.glb');

  // Clone the scene so we can modify materials without affecting the global cache
  const clonedScene = useMemo(() => scene.clone(), [scene]);

  useMemo(() => {
    clonedScene.traverse((child: THREE.Object3D) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;

        // Clone material to avoid side effects and enable custom shader
        if (mesh.material) {
          mesh.material = (mesh.material as THREE.Material).clone();
          const material = mesh.material as THREE.MeshStandardMaterial;

          material.transparent = true;
          // material.depthWrite = false; // Optional: might help if sorting issues arise, but usually true is better for the main object

          material.onBeforeCompile = (shader) => {
            // Add custom varying to pass UV from vertex to fragment shader
            shader.vertexShader = shader.vertexShader.replace(
              'void main() {',
              `
              varying vec2 vCustomUv;
              void main() {
                vCustomUv = uv;
              `
            );

            shader.fragmentShader = shader.fragmentShader.replace(
              'void main() {',
              `
              varying vec2 vCustomUv;
              void main() {
              `
            );

            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <dithering_fragment>',
              `
              #include <dithering_fragment>
              
              // --- Arch Top Edge (Circular/Parabolic Mask) ---
              float edgeWidth = 0.15; 
              
              // Calculate the top boundary as a curve to create an arch
              // Curves down from 1.0 at the center.
              // Asymmetric Arch: Left side is flatter (0.5) to reveal even more of the top-left
              float curveMult = mix(0.5, 2.0, step(0.5, vCustomUv.x));
              float topCurve = 1.0 - curveMult * pow(vCustomUv.x - 0.5, 2.0);

              float alphaMask = smoothstep(0.0, edgeWidth, vCustomUv.x) * 
                                smoothstep(1.0, 1.0 - edgeWidth, vCustomUv.x) * 
                                smoothstep(0.0, edgeWidth, vCustomUv.y) * 
                                smoothstep(topCurve, topCurve - edgeWidth, vCustomUv.y);
              
              gl_FragColor.a *= alphaMask;
              `
            );
          };
        }
      }
    });
  }, [clonedScene]);

  return React.createElement(
    'group' as any,
    props,
    React.createElement('primitive' as any, { object: clonedScene })
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-full w-full text-white">
      <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-orange-500"></div>
    </div>
  );
}

import './newhome.css';

function ResponsiveScene() {
  const { width } = useThree((state: any) => state.size);
  const isMobile = width < 768;

  // Responsive values
  const modelScale = isMobile ? 0.15 : 0.3; // Decreased further
  const htmlScale = isMobile ? 0.19 : 0.3; // Increased to fix shrinkage
  const htmlPosition: [number, number, number] = isMobile ? [0.02, -0.82, 1] : [-0.08, -1.55, 1.65]; // Adjusted Y for larger scale docking

  // Center Position Adjustment
  const centerPosition: [number, number, number] = isMobile ? [0, 0.0, 0] : [0, 0.5, 0]; // Raised to 0.0 per user request

  return (
    <Center position={centerPosition}>
      <ShivaLingaModel scale={modelScale} />
      <Html
        transform
        position={htmlPosition}
        scale={htmlScale}
        style={{
          width: isMobile ? '280px' : '375px', // Smaller width on mobile
          height: isMobile ? '140px' : '185px',
          pointerEvents: 'none',
        }}
        zIndexRange={[0, 0]}
      >
        <div style={{ width: '100%', height: '100%', transform: 'scaleX(1.1)', transformOrigin: 'center' }}>
          <img
            src="/Shivalingbottom.svg"
            alt="Shivalinga Base"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              opacity: 0.75,
              maskImage: 'linear-gradient(to bottom, transparent 0%, black 85%)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 85%)'
            }}
          />
        </div>
      </Html>
    </Center>
  );
}

export default function NewHomePage() {
  const heroWrapperRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // -- AGGRESSIVE SCROLL-TO-UNLOAD LOGIC --
  const [isHeroMounted, setIsHeroMounted] = useState(true);
  const { scrollY } = useScroll({ container: scrollContainerRef });

  // Opacity: Starts fading at 5% (approx 40px), completely gone by 30% (approx 250px)
  // We use standard pixels assuming typical 800px height, so 40px to 250px
  const heroOpacity = useTransform(scrollY, [40, 300], [1, 0]);
  const heroScale = useTransform(scrollY, [40, 300], [1, 0.95]);

  useMotionValueEvent(scrollY, "change", (latest) => {
    // Unmount check
    if (typeof window !== 'undefined') {
      const threshold = window.innerHeight * 0.4; // 40% of screen height

      // ONE-WAY TICKET: Once we pass the threshold, we unmount forever (until refresh)
      if (latest > threshold && isHeroMounted) {
        setIsHeroMounted(false);
      }
      // Removed the 'else if' block to prevent remounting/resource reloading
    }
  });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!heroWrapperRef.current) return;

      const rect = heroWrapperRef.current.getBoundingClientRect();
      // Normalize mouse position to -1 to 1 range
      mousePosition.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mousePosition.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    };

    const handleMouseLeave = () => {
      // Reset to center when mouse leaves
      mousePosition.x = 0;
      mousePosition.y = 0;
    };

    const wrapper = heroWrapperRef.current;
    if (wrapper) {
      wrapper.addEventListener('mousemove', handleMouseMove);
      wrapper.addEventListener('mouseleave', handleMouseLeave);
    }

    return () => {
      if (wrapper) {
        wrapper.removeEventListener('mousemove', handleMouseMove);
        wrapper.removeEventListener('mouseleave', handleMouseLeave);
      }
    };
  }, [isHeroMounted]); // Re-attach listeners if hero remounts

  return (
    <div
      ref={scrollContainerRef}
      className="h-screen w-full overflow-y-scroll snap-y snap-mandatory scroll-smooth bg-white text-black"
    >

      {/* SNAP SECTION 1: HERO SPACER & FIXED CONTENT */}
      {/* This section takes up the full viewport and acts as the 'Home' snap point */}
      <section className="h-screen w-full snap-start relative">
        <AnimatePresence>
          {isHeroMounted && (
            <motion.div
              className="hero-section-wrapper fixed inset-0 z-0 h-screen overflow-hidden"
              ref={heroWrapperRef}
              style={{ opacity: heroOpacity, scale: heroScale }}
              exit={{ opacity: 0 }}
            >
              {/* Himalayan Shader Background */}
              <HimalayanShader />

              {/* Top Heading Text */}
              <div className="frosted-text-container">
                <h1 className="frosted-glass-text">
                  Explore all<br />deities
                </h1>
              </div>

              {/* Right-Side Subtext & Button */}
              <div className="frosted-text-container-right">
                <p className="frosted-glass-text-right">
                  Hand carved dities with the divine blessings
                </p>
                <button className="frosted-glass-button">
                  Explore Arts
                </button>
              </div>

              {/* Center Bottom Text Image with Ice Shine Effect */}
              <div className="center-bottom-text">
                <IceShineText src="/Mahadev_text_comp.png" alt="Mahadev" />
              </div>

              {/* Scroll Indicator */}
              <div className="scroll-indicator">
                <p>Scroll to Bottom</p>
              </div>



              {/* Hero Section Container (Wraps 3D Model) */}
              <section
                id="hero-section"
                className="hero-container"
              >
                {/* 3D Viewer Section (Inside Hero Section) */}
                <div className="hero-canvas-wrapper">
                  <Canvas camera={{ position: [0, 0, 6.5], fov: 35 }} dpr={1} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
                    <Suspense fallback={null}>
                      {/* Optimized Lighting */}
                      {React.createElement('ambientLight' as any, { intensity: 0.6 })}
                      {React.createElement('directionalLight' as any, { position: [5, 8, 5], intensity: 1.8, color: '#ffaa00' })}
                      {React.createElement('directionalLight' as any, { position: [-5, 3, -3], intensity: 1.2, color: '#4444ff' })}

                      <MouseRotationGroup>
                        <ResponsiveScene />
                      </MouseRotationGroup>

                      <OrbitControls
                        enableZoom={false}
                        enablePan={false}
                        enableDamping={true}
                        dampingFactor={0.08}
                        rotateSpeed={0.5}
                        minPolarAngle={Math.PI / 2.2}
                        maxPolarAngle={Math.PI / 1.95}
                        minAzimuthAngle={-Math.PI / 10}
                        maxAzimuthAngle={Math.PI / 10}
                      />
                      <Environment preset="apartment" />
                    </Suspense>
                  </Canvas>
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* SNAP SECTION 2: GALLERY */}
      {/* This section is the destination snap point. Once here, the hero above unmounts. */}
      {/* Remove min-h-screen on mobile to avoid forced height gaps */}
      <section className="min-h-0 lg:min-h-screen w-full snap-start bg-white relative z-10">
        <WorkshopGallery />
      </section>

      {/* SNAP SECTION 3: IDOL SCROLL GALLERY (Horizontal) */}
      <section className="min-h-0 lg:min-h-screen w-full snap-start bg-white relative z-10">
        <IdolScrollGallery containerRef={scrollContainerRef as React.RefObject<HTMLElement>} />
      </section>

    </div>
  );
}

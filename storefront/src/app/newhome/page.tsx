'use client';

import React, { useRef, useState, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, Center, Environment, Float, Html } from '@react-three/drei';
import * as THREE from 'three';
import { motion } from 'framer-motion';
import ShivaLingaParticles from './ShivaLingaParticles';

function ShivaLingaModel({ ...props }) {
  const { scene } = useGLTF('/shivalingamdepth-mesh.glb');

  // Clone the scene so we can modify materials without affecting the global cache
  const clonedScene = useMemo(() => scene.clone(), [scene]);

  useMemo(() => {
    clonedScene.traverse((child) => {
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

  return (
    <group {...props}>
      <primitive object={clonedScene} />
    </group>
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

export default function NewHomePage() {
  return (
    <div className="relative w-full h-screen bg-white text-black overflow-hidden flex items-center justify-center">

      {/* Hero Section Container (Wraps Text and 3D Model) */}
      <section
        id="hero-section"
        className="hero-container"
      >
        {/* Text Content */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="hero-content-wrapper"
        >
          <motion.h2
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="hero-subtitle"
          >
            Sacred Artistry
          </motion.h2>

          <h1 className="hero-title">
            Divine <br /> Aura
          </h1>

          <motion.div
            initial={{ width: 0 }}
            animate={{ width: 80 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="hero-divider"
          ></motion.div>

          <div className="hero-buttons">
            <button className="group btn-primary">
              <span className="btn-primary-text">Explore Collection</span>
              <div className="btn-primary-bg"></div>
            </button>
          </div>
        </motion.div>

        {/* 3D Viewer Section (Inside Hero Section) */}
        <div className="hero-canvas-wrapper">
          <Canvas shadows camera={{ position: [0, 0, 6.5], fov: 35 }} gl={{ localClippingEnabled: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2, alpha: true }}>
            <Suspense fallback={null}>
              {/* Environment & Lighting */}
              
              <ambientLight intensity={0.5} />
              <spotLight position={[10, 10, 5]} angle={0.3} penumbra={1} intensity={2} castShadow color="#ffaa00" />
              <spotLight position={[-10, 5, -5]} angle={0.3} penumbra={1} intensity={2} color="#4444ff" />
              <pointLight position={[0, -2, 0]} intensity={1} color="#ff4400" distance={5} />

              <Center>
                <ShivaLingaModel scale={0.3} />
                <Html
                  transform
                  position={[0, -1.2, 0]} // Adjust position relative to model
                  scale={0.3} // Scale down if needed to fit in the scene
                  style={{
                    width: '500px',
                    height: '350px',
                    pointerEvents: 'none',
                  }}
                  zIndexRange={[0, 0]}
                >
                   <ShivaLingaParticles />
                </Html>
              </Center>

              <OrbitControls
                enableZoom={false}
                enablePan={false}
                minPolarAngle={Math.PI / 3}
                maxPolarAngle={Math.PI / 1.8}
              />
              <Environment preset="city" blur={0.8} />
            </Suspense>
          </Canvas>
        </div>
      </section>

    </div>
  );
}

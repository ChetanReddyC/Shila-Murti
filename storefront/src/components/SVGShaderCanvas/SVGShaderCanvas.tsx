import React, { useRef, useEffect, useState } from 'react';
import styles from './SVGShaderCanvas.module.css';
import { svgLineVertexShaderSource, svgLineFragmentShaderSource } from '../../utils/svgLineShaderSources';
import { createShader, createProgram } from '../../utils/shaderUtils';

interface SVGShaderCanvasProps {
  svgUrl: string;
  width?: number;
  height?: number;
  alwaysOn?: boolean;
}

const SVGShaderCanvas: React.FC<SVGShaderCanvasProps> = ({ 
  svgUrl, 
  width = 501, 
  height = 1115,
  alwaysOn = true 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [svgLoaded, setSvgLoaded] = useState(false);
  const [renderInfo, setRenderInfo] = useState<{frames: number, webglActive: boolean, error?: string}>({
    frames: 0,
    webglActive: false
  });
  const requestRef = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({ width, height });
  
  // This will directly check if WebGL is supported
  useEffect(() => {
    const canvas = document.createElement('canvas');
    try {
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      setRenderInfo(prev => ({...prev, webglActive: !!gl}));
      if (!gl) {
        setRenderInfo(prev => ({...prev, error: 'WebGL not supported in this browser'}));
      }
    } catch (e) {
      setRenderInfo(prev => ({...prev, webglActive: false, error: 'Error initializing WebGL: ' + e}));
    }
  }, []);
  
  useEffect(() => {
    console.log("SVGShaderCanvas initializing with URL:", svgUrl);
    
    // Create image element
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      console.log("SVG image loaded successfully:", img.width, "x", img.height);
      imgRef.current = img;
      
      // Use the actual dimensions of the loaded SVG
      setDimensions({
        width: img.width || width,
        height: img.height || height
      });
      
      setSvgLoaded(true);
    };
    
    img.onerror = (e) => {
      console.error('Error loading SVG:', e);
      setRenderInfo(prev => ({...prev, error: 'Failed to load SVG image: ' + e}));
    };
    
    img.src = svgUrl;
    
    return () => {
      if (imgRef.current) {
        imgRef.current = null;
      }
    };
  }, [svgUrl, width, height]);
  
  useEffect(() => {
    if (!svgLoaded || !imgRef.current || !canvasRef.current) {
      console.log("Not ready to render:", { svgLoaded, hasImgRef: !!imgRef.current, hasCanvasRef: !!canvasRef.current });
      return;
    }
    
    console.log("Setting up WebGL context");
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl', { 
      premultipliedAlpha: false,
      alpha: true,
      antialias: true, // Enable antialiasing for smoother lines
      preserveDrawingBuffer: true // Helps with consistent rendering
    });
    
    if (!gl) {
      console.error('WebGL not supported');
      setRenderInfo(prev => ({...prev, error: 'WebGL context creation failed'}));
      return;
    }
    
    setRenderInfo(prev => ({...prev, webglActive: true}));
    
    // Enable blending for proper alpha handling
    gl.enable(gl.BLEND);
    // Use additive blending for intense glow effect
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    
    // Create shaders
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, svgLineVertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, svgLineFragmentShaderSource);
    
    if (!vertexShader || !fragmentShader) {
      console.error("Failed to create shaders");
      setRenderInfo(prev => ({...prev, error: 'Shader compilation failed'}));
      return;
    }
    
    // Create program
    const program = createProgram(gl, vertexShader, fragmentShader);
    
    if (!program) {
      console.error("Failed to create program");
      setRenderInfo(prev => ({...prev, error: 'Shader program creation failed'}));
      return;
    }
    
    console.log("WebGL program created successfully");
    
    // Set up vertex attribute and uniforms
    const positionAttributeLocation = gl.getAttribLocation(program, 'a_pos');
    const resolutionUniformLocation = gl.getUniformLocation(program, 'u_res');
    const timeUniformLocation = gl.getUniformLocation(program, 'u_time');
    const intensityUniformLocation = gl.getUniformLocation(program, 'u_intensity');
    const textureUniformLocation = gl.getUniformLocation(program, 'u_texture');
    const fadeBottomUniformLocation = gl.getUniformLocation(program, 'u_fadeBottom');
    
    // Create position buffer
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    
    // Four corners of the canvas for a quad (two triangles)
    const positions = [
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ];
    
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    
    // Create texture from the SVG image
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Flip the Y-axis of the texture so its orientation matches the HTML image
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    
    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    // Upload image to texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgRef.current);
    
    // Set up viewport and clear
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    
    console.log("Canvas size set to:", canvas.width, "x", canvas.height);
    
    // Start time for animation
    const startTime = performance.now();
    
    // Frame counter
    let frameCount = 0;
    
    const render = () => {
      // Clear canvas with transparent background
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      // Use shader program
      gl.useProgram(program);
      
      // Bind position buffer
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(positionAttributeLocation);
      gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
      
      // Set uniforms
      const currentTime = (performance.now() - startTime) / 1000; // time in seconds
      gl.uniform1f(timeUniformLocation, currentTime);
      gl.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);
      gl.uniform1f(intensityUniformLocation, alwaysOn ? 2.0 : 0.0); // INCREASED INTENSITY
      gl.uniform1f(fadeBottomUniformLocation, 0.15); // Add bottom fade value - higher value = more fade
      
      // Set texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(textureUniformLocation, 0);
      
      // Draw
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      
      // Update frame counter
      frameCount++;
      if (frameCount % 30 === 0) { // Update UI every 30 frames
        setRenderInfo(prev => ({...prev, frames: frameCount}));
      }
      
      // Request next frame
      requestRef.current = requestAnimationFrame(render);
    };
    
    console.log("Starting render loop");
    render();
    
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      
      // Clean up WebGL resources
      if (gl) {
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteBuffer(positionBuffer);
        gl.deleteTexture(texture);
      }
    };
  }, [svgLoaded, dimensions.width, dimensions.height, alwaysOn]);
  
  return (
    <div className={styles.svgContainer}>
      <canvas 
        ref={canvasRef} 
        className={styles.svgShaderCanvas}
        width={dimensions.width}
        height={dimensions.height}
      />
      
      {/* Debug info - hidden in production */}
      <div className={styles.debugInfo} style={{
        display: 'none', /* Hide debug info in production */
        position: 'absolute',
        bottom: '5px',
        left: '5px',
        backgroundColor: 'rgba(0,0,0,0.7)',
        color: 'white',
        padding: '4px 8px',
        fontSize: '10px',
        borderRadius: '4px',
        zIndex: 100,
        pointerEvents: 'none'
      }}>
        {!svgLoaded && <div>Loading SVG...</div>}
        {renderInfo.webglActive && <div>WebGL Active ✓</div>}
        {renderInfo.frames > 0 && <div>Frames: {renderInfo.frames}</div>}
        {renderInfo.error && <div style={{color: 'red'}}>Error: {renderInfo.error}</div>}
      </div>
    </div>
  );
};

export default SVGShaderCanvas; 
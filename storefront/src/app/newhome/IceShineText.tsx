'use client';

import React, { useRef, useEffect, useCallback } from 'react';

const vertexShaderSource = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  
  varying vec2 v_texCoord;
  uniform sampler2D u_image;
  uniform vec2 u_mouse;
  uniform float u_time;
  uniform float u_hover;
  
  void main() {
    vec4 texColor = texture2D(u_image, v_texCoord);
    
    // Skip transparent pixels
    if (texColor.a < 0.1) {
      gl_FragColor = texColor;
      return;
    }
    
    // If not hovering, just show original image
    if (u_hover < 0.01) {
      gl_FragColor = texColor;
      return;
    }
    
    // Calculate distance from mouse position (normalized 0-1)
    vec2 mousePos = u_mouse * 0.5 + 0.5; // Convert from -1,1 to 0,1
    float dist = distance(v_texCoord, mousePos);
    
    // Create multiple specular highlights for ice crystal effect (reduced intensity)
    float specular1 = pow(max(0.0, 1.0 - dist * 2.5), 4.0);
    float specular2 = pow(max(0.0, 1.0 - dist * 3.5), 8.0);
    
    // Add subtle shimmer based on position and time (reduced)
    float shimmer = sin(v_texCoord.x * 30.0 + u_time * 2.0) * 
                    sin(v_texCoord.y * 25.0 + u_time * 1.5) * 0.5 + 0.5;
    shimmer = pow(shimmer, 3.0) * 0.08;
    
    // Ice-like caustic pattern (reduced)
    float caustic = sin(v_texCoord.x * 50.0 + v_texCoord.y * 40.0 + u_time) * 0.5 + 0.5;
    caustic *= sin(v_texCoord.x * 35.0 - v_texCoord.y * 45.0 - u_time * 0.7) * 0.5 + 0.5;
    caustic = pow(caustic, 2.0) * specular1 * 0.15;
    
    // Subtle pulse effect while hovering (oscillates from dimmer to normal)
    float pulse = 0.7 + (sin(u_time * 1.8) * 0.5 + 0.5) * 0.3;
    
    // Combine specular highlights (reduced multipliers) with pulse
    float totalSpecular = (specular1 * 0.25 + specular2 * 0.5 + shimmer * specular1 + caustic) * u_hover * pulse;
    
    // Ice tint color (cool blue-white)
    vec3 iceTint = vec3(0.9, 0.97, 1.0);
    vec3 highlightColor = vec3(1.0, 1.0, 1.0);
    
    // Apply specular to the texture
    vec3 finalColor = texColor.rgb + highlightColor * totalSpecular * texColor.a;
    
    // Add slight blue tint to highlights
    finalColor = mix(finalColor, finalColor * iceTint, totalSpecular * 0.15);
    
    // Ensure we don't exceed 1.0
    finalColor = clamp(finalColor, 0.0, 1.0);
    
    gl_FragColor = vec4(finalColor, texColor.a);
  }
`;

interface IceShineTextProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
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

function createProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;
  
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  
  return program;
}

export default function IceShineText({ src, alt = '', className = '', style = {} }: IceShineTextProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const targetMouseRef = useRef({ x: 0, y: 0 });
  const animationRef = useRef<number>(0);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const hoverRef = useRef<number>(0);
  const targetHoverRef = useRef<number>(0);

  const render = useCallback(() => {
    const gl = glRef.current;
    const program = programRef.current;
    
    if (!gl || !program) return;
    
    // Smooth mouse interpolation
    mouseRef.current.x += (targetMouseRef.current.x - mouseRef.current.x) * 0.08;
    mouseRef.current.y += (targetMouseRef.current.y - mouseRef.current.y) * 0.08;
    
    // Smooth hover interpolation
    hoverRef.current += (targetHoverRef.current - hoverRef.current) * 0.1;
    
    // Update uniforms
    const mouseLocation = gl.getUniformLocation(program, 'u_mouse');
    const timeLocation = gl.getUniformLocation(program, 'u_time');
    const hoverLocation = gl.getUniformLocation(program, 'u_hover');
    
    gl.uniform2f(mouseLocation, mouseRef.current.x, -mouseRef.current.y);
    gl.uniform1f(timeLocation, (Date.now() - startTimeRef.current) / 1000);
    gl.uniform1f(hoverLocation, hoverRef.current);
    
    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    animationRef.current = requestAnimationFrame(render);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { 
      alpha: true, 
      premultipliedAlpha: false,
      preserveDrawingBuffer: true 
    });
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    
    glRef.current = gl;

    // Create shaders
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    
    if (!vertexShader || !fragmentShader) return;

    // Create program
    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) return;
    
    programRef.current = program;
    gl.useProgram(program);

    // Set up geometry (full screen quad)
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Set up texture coordinates
    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 1, 1, 1, 0, 0,
      0, 0, 1, 1, 1, 0,
    ]), gl.STATIC_DRAW);

    const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

    // Load image and create texture
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      // Set canvas size to match image
      canvas.width = image.width;
      canvas.height = image.height;
      gl.viewport(0, 0, image.width, image.height);

      // Create and bind texture
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

      // Enable blending for transparency
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);

      // Start render loop
      startTimeRef.current = Date.now();
      render();
    };
    image.src = src;

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [src, render]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    // Normalize to -1 to 1 range
    targetMouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    targetMouseRef.current.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    targetHoverRef.current = 1;
  }, []);

  const handleMouseLeave = useCallback(() => {
    // Smoothly fade out the effect
    targetHoverRef.current = 0;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ 
        ...style,
        maxWidth: '100%',
        height: 'auto',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      aria-label={alt}
    />
  );
}

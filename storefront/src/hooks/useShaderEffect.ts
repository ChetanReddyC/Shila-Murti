
import { useEffect, useRef, useState, useCallback } from 'react';
import { createShader, createProgram } from '../utils/shaderUtils';

export const useShaderEffect = (canvasRef: React.RefObject<HTMLCanvasElement>, vertexShaderSource: string, fragmentShaderSource: string) => {
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const hoverRef = useRef(isHovering);
  hoverRef.current = isHovering;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    glRef.current = gl;

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) {
      return;
    }

    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) {
      return;
    }
    programRef.current = program;

    const positionAttributeLocation = gl.getAttribLocation(program, "a_pos");
    const resolutionUniformLocation = gl.getUniformLocation(program, "u_res");
    const timeUniformLocation = gl.getUniformLocation(program, "u_time");
    const intensityUniformLocation = gl.getUniformLocation(program, "u_intensity");

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);

    let startTime = Date.now();
    let intensity = 0;

    const render = () => {
      if (!gl || !program) return;

      const targetIntensity = hoverRef.current ? 1 : 0;
      intensity += (targetIntensity - intensity) * 0.1;

      if (Math.abs(intensity - targetIntensity) < 0.001) {
        intensity = targetIntensity;
      }

      const currentTime = (Date.now() - startTime) / 1000;
      gl.uniform1f(timeUniformLocation, currentTime);
      gl.uniform1f(intensityUniformLocation, intensity);
      
      if (intensity > 0.001) {
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      } else {
        gl.clear(gl.COLOR_BUFFER_BIT);
      }

      animationFrameId.current = requestAnimationFrame(render);
    };

    render();

    const handleResize = () => {
        if (!gl || !canvas) return;
        const displayWidth  = canvas.clientWidth;
        const displayHeight = canvas.clientHeight;

        if (canvas.width  !== displayWidth || canvas.height !== displayHeight) {
            canvas.width  = displayWidth;
            canvas.height = displayHeight;
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
            gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
        }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (gl) {
        gl.deleteProgram(program);
        gl.deleteShader(fragmentShader);
        gl.deleteShader(vertexShader);
        gl.deleteBuffer(positionBuffer);
      }
    };
  }, [canvasRef, vertexShaderSource, fragmentShaderSource]);

  const setHover = useCallback((hover: boolean) => {
    setIsHovering(hover);
  }, []);

  return { setHover };
};

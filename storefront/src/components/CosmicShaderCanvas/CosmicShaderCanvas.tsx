import React, { useRef, useEffect, useState, useCallback } from 'react';
import styles from './CosmicShaderCanvas.module.css';
import { createShader, createProgram } from '../../utils/shaderUtils';
import { getCosmicVariationShader } from '../../utils/applyCosmicVariation';

interface CosmicShaderCanvasProps {
    isHovering: boolean;
    variation: number;
}

const vertexShaderSource = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const CosmicShaderCanvas: React.FC<CosmicShaderCanvasProps> = ({ isHovering, variation }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const glRef = useRef<WebGLRenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const animationFrameId = useRef<number | null>(null);
    const [isHoveringState, setIsHoveringState] = useState(false);
    const hoverRef = useRef(isHoveringState);
    hoverRef.current = isHoveringState;

    const setHover = useCallback((hover: boolean) => {
        setIsHoveringState(hover);
    }, []);

    useEffect(() => {
        setHover(isHovering);
    }, [isHovering, setHover]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
        if (!gl) {
            return;
        }
        glRef.current = gl;

        // Enable blending for proper alpha compositing
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const setupShader = () => {
            const fragmentShaderSource = getCosmicVariationShader(variation);

            const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
            const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

            if (!vertexShader || !fragmentShader) {
                return null;
            }

            const program = createProgram(gl, vertexShader, fragmentShader);
            if (!program) {
                return null;
            }

            return program;
        };

        const program = setupShader();
        if (!program) return;

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

            gl.clear(gl.COLOR_BUFFER_BIT);

            if (intensity > 0.001) {
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }

            animationFrameId.current = requestAnimationFrame(render);
        };

        render();

        const handleResize = () => {
            if (!gl || !canvas) return;
            const displayWidth = canvas.clientWidth;
            const displayHeight = canvas.clientHeight;

            if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
                canvas.width = displayWidth;
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
                gl.deleteBuffer(positionBuffer);
            }
        };
    }, [variation]); // Re-run when variation changes

    // Handle manual resizing
    useEffect(() => {
        const handleResize = () => {
            if (!canvasRef.current) return;

            const canvas = canvasRef.current;
            const parentElement = canvas.parentElement;

            if (parentElement) {
                const parentWidth = parentElement.clientWidth;
                const parentHeight = parentElement.clientHeight;

                if (canvas.width !== parentWidth || canvas.height !== parentHeight) {
                    canvas.width = parentWidth;
                    canvas.height = parentHeight;
                }
            }
        };

        handleResize();

        window.addEventListener('resize', handleResize);

        let resizeObserver: ResizeObserver | null = null;
        if (canvasRef.current && 'ResizeObserver' in window) {
            resizeObserver = new ResizeObserver(handleResize);
            resizeObserver.observe(canvasRef.current.parentElement as Element);
        }

        return () => {
            window.removeEventListener('resize', handleResize);
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
        };
    }, []);

    return <canvas ref={canvasRef} className={styles.cosmicCanvas} style={{ backgroundColor: 'transparent' }} />;
};

export default CosmicShaderCanvas;
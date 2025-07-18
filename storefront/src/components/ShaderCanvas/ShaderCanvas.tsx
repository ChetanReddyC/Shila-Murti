import React, { useRef, useEffect } from 'react';
import styles from './ShaderCanvas.module.css';
import { useShaderEffect } from '../../hooks/useShaderEffect';
import { vertexShaderSource, fragmentShaderSource } from '../../utils/shaderSources';

interface ShaderCanvasProps {
  isHovering: boolean;
}

const ShaderCanvas: React.FC<ShaderCanvasProps> = ({ isHovering }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { setHover } = useShaderEffect(canvasRef, vertexShaderSource, fragmentShaderSource);

  useEffect(() => {
    setHover(isHovering);
  }, [isHovering, setHover]);

  return <canvas ref={canvasRef} className={styles.shaderCanvas} />;
};

export default ShaderCanvas;

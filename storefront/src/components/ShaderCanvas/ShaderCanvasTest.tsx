'use client';

import React, { useState } from 'react';
import ShaderCanvas from './ShaderCanvas';
import styles from './ShaderCanvas.module.css';

/**
 * Test component for the ShaderCanvas
 * This component demonstrates the shader effect with controls for testing
 */
const ShaderCanvasTest: React.FC = () => {
  const [isHovered, setIsHovered] = useState(false);
  const [intensity, setIntensity] = useState(1.0);
  const [speed, setSpeed] = useState(1.0);
  const [borderWidth, setBorderWidth] = useState(0.12);
  const [color, setColor] = useState<[number, number, number]>([0.15, 0.2, 0.25]);
  
  // Convert hex color to RGB array (0-1 range)
  const handleColorChange = (hexColor: string) => {
    const r = parseInt(hexColor.slice(1, 3), 16) / 255;
    const g = parseInt(hexColor.slice(3, 5), 16) / 255;
    const b = parseInt(hexColor.slice(5, 7), 16) / 255;
    setColor([r, g, b]);
  };
  
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-4">Shader Canvas Test</h2>
      
      <div className="flex flex-col md:flex-row gap-8">
        {/* Test card with shader */}
        <div 
          className="relative h-70 w-55 rounded-xl overflow-hidden bg-cover bg-center"
          style={{
            backgroundImage: `linear-gradient(0deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0) 100%), url("https://lh3.googleusercontent.com/aida-public/AB6AXuDLuyJZ0xxw_l9UUZPYMMLIG5k9I8fiVs6lcmflwE_12DaUsTg9Zz4nHSGXRPCWuHcGg4SgqHcaFm5a2_OlvZj6CgnY-9pNDVRy1WIJbv-LWBQ6lE_k-teSL6Da366eZQ323rHVwrTqos9EKSJ5ucUGKwNhtdwJUbaznsE3Cu0SrlKj-M76eTRkXlyudU1atflukUlrRQe7bxiAY2yA5vrHir7LVQrFeRh1mDe9IrNGiY-uJvCQPWB2_GI_YqTIEF9MvM-HuI1oleSI")`,
            width: '220px',
            height: '280px'
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <ShaderCanvas 
            isActive={isHovered} 
            intensity={intensity}
            speed={speed}
            color={color}
            borderWidth={borderWidth}
          />
          <p className="absolute bottom-4 left-4 text-white text-base font-bold leading-tight w-4/5 line-clamp-2">
            Ganesha Idol
          </p>
        </div>
        
        {/* Controls */}
        <div className="flex flex-col gap-4 w-full md:w-1/2">
          <div>
            <label className="block text-sm font-medium mb-1">Hover State</label>
            <div className="flex items-center">
              <input 
                type="checkbox" 
                checked={isHovered} 
                onChange={(e) => setIsHovered(e.target.checked)}
                className="mr-2"
              />
              <span>{isHovered ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Intensity: {intensity.toFixed(2)}</label>
            <input 
              type="range" 
              min="0" 
              max="2" 
              step="0.01" 
              value={intensity} 
              onChange={(e) => setIntensity(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Speed: {speed.toFixed(2)}</label>
            <input 
              type="range" 
              min="0.1" 
              max="3" 
              step="0.1" 
              value={speed} 
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Border Width: {borderWidth.toFixed(2)}</label>
            <input 
              type="range" 
              min="0.01" 
              max="0.25" 
              step="0.01" 
              value={borderWidth} 
              onChange={(e) => setBorderWidth(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Color</label>
            <input 
              type="color" 
              value={`#${Math.round(color[0] * 255).toString(16).padStart(2, '0')}${Math.round(color[1] * 255).toString(16).padStart(2, '0')}${Math.round(color[2] * 255).toString(16).padStart(2, '0')}`}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-full h-8"
            />
          </div>
          
          <div className="mt-4">
            <h3 className="font-medium mb-2">Current Settings:</h3>
            <pre className="bg-gray-100 p-2 rounded text-sm">
              {JSON.stringify({
                isActive: isHovered,
                intensity,
                speed,
                borderWidth,
                color: color.map(c => c.toFixed(2))
              }, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShaderCanvasTest;
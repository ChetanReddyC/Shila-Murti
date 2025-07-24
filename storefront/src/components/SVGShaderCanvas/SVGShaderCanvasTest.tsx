'use client';

import React, { useState } from 'react';
import SVGShaderCanvas from './SVGShaderCanvas';

const SVGShaderCanvasTest: React.FC = () => {
  const [intensity, setIntensity] = useState(1.0);

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-4">SVG Shader Canvas Test</h2>
      
      <div className="flex flex-col md:flex-row gap-8">
        {/* Test SVG Shader Canvas */}
        <div className="relative" style={{ width: '500px', height: '500px' }}>
          <SVGShaderCanvas 
            svgUrl="/svg-art1.svg"
            width={500}
            height={500}
            alwaysOn={true}
          />
        </div>
        
        {/* Controls */}
        <div className="flex flex-col gap-4">
          <div>
            <label className="block mb-2">Intensity: {intensity}</label>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01"
              value={intensity}
              onChange={(e) => setIntensity(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SVGShaderCanvasTest; 
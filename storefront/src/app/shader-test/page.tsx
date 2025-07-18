'use client';

import React from 'react';
import ShaderCanvasTest from '../../components/ShaderCanvas/ShaderCanvasTest';

export default function ShaderTestPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Shader Effect Test Page</h1>
      <ShaderCanvasTest />
    </div>
  );
}
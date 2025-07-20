export const edgeGradientVertexShaderSource = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

export const edgeGradientFragmentShaderSource = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_res;
  uniform float u_intensity;
  uniform vec2 u_mouse; // Mouse position for repulsor effect
  
  void main() {
    // Normalized coordinates from 0 to 1
    vec2 uv = v_uv;
    
    // Calculate distance from each edge separately
    float distanceFromLeft = uv.x;
    float distanceFromRight = 1.0 - uv.x;
    float distanceFromTop = uv.y;
    float distanceFromBottom = 1.0 - uv.y;
    
    // Create individual gradients for each edge
    float leftGradient = smoothstep(0.0, 0.35, distanceFromLeft);
    float rightGradient = smoothstep(0.0, 0.35, distanceFromRight);
    float topGradient = smoothstep(0.0, 0.35, distanceFromTop);
    float bottomGradient = smoothstep(0.0, 0.35, distanceFromBottom);
    
    // Repulsor effect - calculate distance from mouse position
    vec2 mousePos = u_mouse / u_res; // Normalize mouse position
    float distToMouse = distance(uv, mousePos);
    
    // Create a repulsion field that pushes the gradient away from the mouse
    float repulsionStrength = 0.15; // Strength of repulsion
    float repulsionRadius = 0.3; // Radius of effect
    float repulsionFalloff = smoothstep(0.0, repulsionRadius, distToMouse);
    
    // Apply repulsion to each gradient
    float repulsionEffect = repulsionStrength * (1.0 - repulsionFalloff) * u_intensity;
    leftGradient = mix(leftGradient, 1.0, repulsionEffect * (1.0 - abs(mousePos.x - 0.0)));
    rightGradient = mix(rightGradient, 1.0, repulsionEffect * (1.0 - abs(mousePos.x - 1.0)));
    topGradient = mix(topGradient, 1.0, repulsionEffect * (1.0 - abs(mousePos.y - 0.0)));
    bottomGradient = mix(bottomGradient, 1.0, repulsionEffect * (1.0 - abs(mousePos.y - 1.0)));
    
    // Add a dynamic wave effect that emanates from the mouse position
    float waveSpeed = 3.0;
    float waveFreq = 10.0;
    float waveAmp = 0.05 * u_intensity;
    float wave = sin(distToMouse * waveFreq - u_time * waveSpeed) * waveAmp * (1.0 - repulsionFalloff);
    
    // Combine gradients by multiplying them
    float combinedGradient = (leftGradient * rightGradient * topGradient * bottomGradient) + wave;
    combinedGradient = clamp(combinedGradient, 0.0, 1.0);
    
    // Apply hover intensity
    float opacity = (1.0 - combinedGradient) * u_intensity;
    
    // Use a semi-transparent white for the blur effect
    vec3 color = vec3(1.0);
    
    gl_FragColor = vec4(color, opacity);
  }
`; 
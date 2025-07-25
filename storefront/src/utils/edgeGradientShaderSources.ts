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
  uniform vec2 u_mouse; // Mouse position for cosmic energy effect
  
  // Cosmic noise function
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123);
  }
  
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y);
  }
  
  void main() {
    vec2 uv = v_uv;
    float t = u_time * 0.5;
    
    // Calculate distance from each edge
    float distanceFromLeft = uv.x;
    float distanceFromRight = 1.0 - uv.x;
    float distanceFromTop = uv.y;
    float distanceFromBottom = 1.0 - uv.y;
    
    // Create cosmic energy gradients for each edge
    float leftGradient = smoothstep(0.0, 0.4, distanceFromLeft);
    float rightGradient = smoothstep(0.0, 0.4, distanceFromRight);
    float topGradient = smoothstep(0.0, 0.4, distanceFromTop);
    float bottomGradient = smoothstep(0.0, 0.4, distanceFromBottom);
    
    // Mouse position for cosmic energy interaction
    vec2 mousePos = u_mouse / u_res;
    float distToMouse = distance(uv, mousePos);
    
    // Create cosmic energy field around mouse
    float energyRadius = 0.4;
    float energyFalloff = smoothstep(energyRadius, 0.0, distToMouse);
    
    // Add cosmic noise to the energy field
    float cosmicNoise = noise(uv * 8.0 + vec2(t * 2.0, -t * 1.5));
    float energyPulse = sin(distToMouse * 15.0 - t * 4.0) * 0.5 + 0.5;
    
    // Combine energy effects
    float cosmicEnergy = energyFalloff * energyPulse * cosmicNoise * u_intensity;
    
    // Apply cosmic energy to gradients
    leftGradient = mix(leftGradient, 0.2, cosmicEnergy * (1.0 - mousePos.x));
    rightGradient = mix(rightGradient, 0.2, cosmicEnergy * mousePos.x);
    topGradient = mix(topGradient, 0.2, cosmicEnergy * (1.0 - mousePos.y));
    bottomGradient = mix(bottomGradient, 0.2, cosmicEnergy * mousePos.y);
    
    // Add cosmic lightning effect
    float lightning = 0.0;
    for(int i = 0; i < 3; i++) {
      float offset = float(i) * 2.1;
      vec2 lightningUV = uv + vec2(sin(t * 3.0 + offset) * 0.1, cos(t * 2.5 + offset) * 0.1);
      float lightningNoise = noise(lightningUV * 20.0 + vec2(t * 5.0));
      lightning += smoothstep(0.85, 1.0, lightningNoise) * 0.3;
    }
    
    // Combine all gradients
    float combinedGradient = leftGradient * rightGradient * topGradient * bottomGradient;
    combinedGradient += lightning * u_intensity;
    combinedGradient = clamp(combinedGradient, 0.0, 1.0);
    
    // Create cosmic glow opacity
    float opacity = (1.0 - combinedGradient) * u_intensity;
    opacity += cosmicEnergy * 0.3;
    
    // Cosmic color palette - electric blues and purples
    vec3 cosmicBlue = vec3(0.2, 0.4, 1.0);
    vec3 cosmicPurple = vec3(0.6, 0.2, 1.0);
    vec3 cosmicWhite = vec3(1.0, 0.9, 1.0);
    
    // Mix colors based on effects
    vec3 color = mix(cosmicBlue, cosmicPurple, cosmicNoise);
    color = mix(color, cosmicWhite, lightning);
    color = mix(color, cosmicWhite, cosmicEnergy * 0.5);
    
    gl_FragColor = vec4(color, opacity);
  }
`; 
export const vertexShaderSource = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

export const fragmentShaderSource = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_res;
  uniform float u_intensity;

  // 2D noise functions (hash, noise, fbm)
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
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for(int i = 0; i < 8; i++) {
      v += a * noise(p);
      // More random time offsets for continuous variation
      p = 2.0 * p + vec2(cos(u_time * 0.3 + float(i) * 1.7), sin(u_time * 0.4 + float(i) * 2.3));
      a *= 0.5;
    }
    return v;
  }

  // SDF for a 2D box
  float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  void main() {
    // Center coordinates
    vec2 uv = v_uv - 0.5;
    float t = u_time * 0.35; // Slower, more elegant animation speed

    // Correct for aspect ratio
    float aspect = u_res.x / u_res.y;
    uv.x *= aspect;

    // Define outer and inner rectangle dimensions for a hollow shape
    vec2 outer_dims = vec2(0.6 * aspect, 0.6);
    vec2 inner_dims = vec2(outer_dims.x - 0.55, outer_dims.y - 0.55);
  
    // Calculate SDF for outer and inner boxes
    float dist_outer = sdBox(uv, outer_dims);
    float dist_inner = sdBox(uv, inner_dims);

    // Combine distances to create a hollow rectangle SDF
    float dist = max(dist_outer, -dist_inner);

    // Create a soft mask from the distance field with a wider gradient
    float mask = smoothstep(0.55, 0.0, dist);

    // Multiple swirl layers for more complex, continuous motion
    float angleNoise1 = fbm(uv * 1.8 + vec2(0.0, -t));
    float angleNoise2 = fbm(uv * 2.3 + vec2(t * 0.7, 0.0));
    float combinedNoise = (angleNoise1 + angleNoise2 * 0.6) / 1.6;
    
    float swirlAngle = mix(0.0, 4.0, mask) * (combinedNoise - 0.5) * 6.1415;
    mat2 rot = mat2(cos(swirlAngle), -sin(swirlAngle), sin(swirlAngle), cos(swirlAngle));
    vec2 p = rot * uv;

    // Enhanced layered distortion with multiple frequencies for continuous motion
    p += vec2(
      sin((uv.y + t) * 3.5) * 0.12 + sin((uv.y + t * 1.3) * 7.0) * 0.04,
      cos((uv.x - t) * 3.2) * 0.12 + cos((uv.x - t * 1.1) * 6.5) * 0.04
    ) * mask;

    // Multiple density layers for richer, more continuous smoke
    float density1 = fbm(p * 4.9 - vec2(0.0, t * 0.6));
    float density2 = fbm(p * 9.8 + vec2(t * 0.1, -t * 0.3));
    float density3 = fbm(p * 19.4 - vec2(t * 0.2, t * 0.3));
    
    // Combine densities with different weights for layered effect
    float density = (density1 * 0.6 + density2 * 0.3 + density3 * 0.2);
    density *= 1.7 * mask; // Increased from 0.8 to 1.0 for more occurrence
    
    // Lower threshold for more visible smoke, smoother transition
    float alpha = smoothstep(0.35, 0.75, density); // Lowered from 0.35, 0.65

    // Symmetric smooth edge fading for all sides
    vec2 edge_uv = abs(v_uv - 0.5) * 2.0;
    
    // Separate X and Y edge fades for better control
    float edge_fade_x = 1.0 - smoothstep(0.4, 1.2, edge_uv.x);
    float edge_fade_y = 1.0 - smoothstep(0.4, 1.2, edge_uv.y);
    
    // Combine with multiplication for smooth corners
    float edge_fade = edge_fade_x * edge_fade_y;
    
    // Additional radial fade for ultra-smooth edges
    float center_dist = length(v_uv - 0.5);
    float radial_fade = 1.0 - smoothstep(0.3, 0.9, center_dist);
    
    // Soft vignette for natural falloff
    float vignette = 1.0 - pow(center_dist * 1.8, 2.5);
    vignette = clamp(vignette, 0.0, 1.0);
    
    // Combine all fades
    float combined_fade = edge_fade * radial_fade * vignette;

    // Final color blending with symmetric smooth edges
    vec3 fluid_color = vec3(0.2, 0.25, 0.3);
    gl_FragColor = vec4(fluid_color, alpha * u_intensity * combined_fade);
  }
`;

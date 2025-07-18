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
    for(int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = 2.0 * p + vec2(cos(u_time * 0.2), sin(u_time * 0.3));
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
    float t = u_time * 0.4;

    // Correct for aspect ratio
    float aspect = u_res.x / u_res.y;
    uv.x *= aspect;

    // Define outer and inner rectangle dimensions for a hollow shape
    vec2 outer_dims = vec2(0.5 * aspect, 0.5);
    vec2 inner_dims = vec2(outer_dims.x - 0.15, outer_dims.y - 0.15);
  
    // Calculate SDF for outer and inner boxes
    float dist_outer = sdBox(uv, outer_dims);
    float dist_inner = sdBox(uv, inner_dims);

    // Combine distances to create a hollow rectangle SDF
    float dist = max(dist_outer, -dist_inner);

    // Create a soft mask from the distance field with a wider gradient
    float mask = smoothstep(0.55, 0.0, dist);

    // Swirl field guided by the rectangular distance field
    float angleNoise = fbm(uv * 1.5 + vec2(0.0, -t));
    float swirlAngle = mix(0.0, 3.0, mask) * (angleNoise - 0.5) * 3.1415;
    mat2 rot = mat2(cos(swirlAngle), -sin(swirlAngle), sin(swirlAngle), cos(swirlAngle));
    vec2 p = rot * uv;

    // Layered sinusoidal distortion for structure, contained by the mask
    p += vec2(
      sin((uv.y + t) * 3.0) * 0.1,
      cos((uv.x - t) * 3.0) * 0.1
    ) * mask;

    // Compute density based on the distorted coordinates and mask
    float density = fbm(p * 1.3 - vec2(0.0, t * 0.6));
    density *= 0.8 * mask;
    float alpha = smoothstep(0.35, 0.65, density);

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


export const svgLineVertexShaderSource = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

export const svgLineFragmentShaderSource = `
  precision mediump float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_res;
  uniform float u_intensity;
  uniform sampler2D u_texture;

  // Enhanced noise functions
  vec2 random2(vec2 st) {
    st = vec2(dot(st, vec2(127.1, 311.7)), dot(st, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(st) * 43758.5453123);
  }

  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dot(random2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                   dot(random2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
               mix(dot(random2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                   dot(random2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
  }

  float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 0.0;
    
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(st);
      st *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    // Sample the original SVG texture
    vec4 svgCol = texture2D(u_texture, v_uv);
    if (svgCol.a < 0.05) {
      discard;
    }

    vec2 st = v_uv;
    float time = u_time * 2.0; // Faster for visibility
    
    // Create very obvious cosmic disturbances
    float cosmicNoise = fbm(st * 4.0 + vec2(time * 0.3, -time * 0.2));
    
    // Add some simple movement
    float movement = sin(st.x * 3.0 + time) * cos(st.y * 2.0 + time * 0.8);
    
    // Combine for dramatic effect
    float disturbance = cosmicNoise + movement * 0.3;
    
    // Normalize
    disturbance = (disturbance + 1.0) * 0.5;
    
    // Create dramatic visibility changes - parts disappear completely
    float visibility;
    if (disturbance < 0.4) {
      visibility = 0.1; // Almost invisible
    } else if (disturbance > 0.6) {
      visibility = 1.0; // Fully visible
    } else {
      visibility = mix(0.1, 1.0, (disturbance - 0.4) / 0.2); // Smooth transition
    }
    
    // Add pulsing for extra visibility
    float pulse = sin(time * 1.5) * 0.2 + 0.8;
    visibility *= pulse;
    
    // Apply intensity
    visibility *= u_intensity;
    
    // Keep original SVG colors unchanged - only affect alpha/visibility
    gl_FragColor = vec4(svgCol.rgb, svgCol.a * visibility);
  }
`; 
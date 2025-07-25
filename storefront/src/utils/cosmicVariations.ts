// Cosmic Shader Variations for the Animation System

// Variation 1: Galactic Nebula (Current Implementation)
export const cosmicVariation1 = {
  name: "Galactic Nebula",
  description: "Deep space nebula with spiral arms and cosmic energy",
  colors: {
    deepSpace: "vec3(0.05, 0.02, 0.15)",
    nebula: "vec3(0.3, 0.1, 0.6)",
    energy: "vec3(0.8, 0.2, 0.9)",
    stars: "vec3(0.9, 0.9, 1.0)"
  }
};

// Variation 2: Aurora Cosmic
export const cosmicVariation2_ProductCard = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_res;
  uniform float u_intensity;

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
    for(int i = 0; i < 6; i++) {
      v += a * noise(p);
      p = 2.0 * p + vec2(cos(u_time * 0.2 + float(i) * 2.1), sin(u_time * 0.15 + float(i) * 1.8));
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = v_uv - 0.5;
    float t = u_time * 0.4;
    
    float aspect = u_res.x / u_res.y;
    uv.x *= aspect;
    float dist = length(uv);
    
    // Aurora-like flowing waves
    float wave1 = sin(uv.y * 8.0 + t * 2.0) * 0.1;
    float wave2 = sin(uv.y * 12.0 + t * 1.5 + wave1) * 0.08;
    float wave3 = sin(uv.y * 16.0 + t * 2.5 + wave2) * 0.06;
    
    vec2 aurora_uv = uv + vec2(wave1 + wave2 + wave3, 0.0);
    
    // Create aurora bands
    float aurora1 = fbm(aurora_uv * 3.0 + vec2(t * 0.1, 0.0));
    float aurora2 = fbm(aurora_uv * 5.0 + vec2(t * 0.15, 0.0));
    
    // Combine aurora effects
    float aurora_density = (aurora1 * 0.6 + aurora2 * 0.4);
    
    // Add cosmic sparkles
    float sparkles = hash(floor(uv * 25.0 + t * 1.5));
    sparkles = smoothstep(0.96, 1.0, sparkles);
    
    // Aurora colors - greens, blues, and purples
    vec3 aurora_green = vec3(0.2, 0.8, 0.3);
    vec3 aurora_blue = vec3(0.1, 0.4, 0.9);
    vec3 aurora_purple = vec3(0.6, 0.2, 0.8);
    vec3 sparkle_white = vec3(1.0, 1.0, 1.0);
    
    vec3 aurora_color = mix(aurora_green, aurora_blue, aurora1);
    aurora_color = mix(aurora_color, aurora_purple, aurora2 * 0.7);
    aurora_color = mix(aurora_color, sparkle_white, sparkles);
    
    // Edge fading
    float radial_fade = 1.0 - smoothstep(0.3, 1.2, dist);
    vec2 edge_uv = abs(v_uv - 0.5) * 2.0;
    float edge_fade = (1.0 - smoothstep(0.6, 1.0, edge_uv.x)) * (1.0 - smoothstep(0.6, 1.0, edge_uv.y));
    
    float alpha = (aurora_density * 0.8 + sparkles * 0.4) * radial_fade * edge_fade;
    
    gl_FragColor = vec4(aurora_color, alpha * u_intensity);
  }
`;

// Variation 3: Solar Flare Cosmic
export const cosmicVariation3_ProductCard = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_res;
  uniform float u_intensity;

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
      p = 2.0 * p + vec2(cos(u_time * 0.3 + float(i) * 1.5), sin(u_time * 0.25 + float(i) * 1.2));
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = v_uv - 0.5;
    float t = u_time * 0.6;
    
    float aspect = u_res.x / u_res.y;
    uv.x *= aspect;
    float dist = length(uv);
    
    // Solar flare emanating from center
    float angle = atan(uv.y, uv.x);
    float flare_intensity = 1.0 / (dist + 0.1);
    
    // Create solar flare streams
    float flare1 = sin(angle * 6.0 + t * 3.0) * 0.5 + 0.5;
    float flare2 = sin(angle * 8.0 + t * 2.5) * 0.5 + 0.5;
    float flare3 = sin(angle * 4.0 + t * 4.0) * 0.5 + 0.5;
    
    // Combine flares with distance falloff
    float solar_flares = (flare1 * 0.4 + flare2 * 0.35 + flare3 * 0.25) * flare_intensity;
    
    // Add solar corona
    float corona = fbm(uv * 2.0 + vec2(t * 0.1, -t * 0.08));
    corona *= smoothstep(1.0, 0.2, dist);
    
    // Solar plasma turbulence
    float plasma = fbm(uv * 4.0 + vec2(t * 0.2, t * 0.15));
    plasma *= smoothstep(0.8, 0.1, dist);
    
    // Combine all solar effects
    float solar_density = solar_flares * 0.6 + corona * 0.3 + plasma * 0.1;
    
    // Solar colors - oranges, reds, and yellows
    vec3 solar_core = vec3(1.0, 0.9, 0.2);
    vec3 solar_orange = vec3(1.0, 0.5, 0.1);
    vec3 solar_red = vec3(0.9, 0.2, 0.1);
    vec3 solar_white = vec3(1.0, 1.0, 1.0);
    
    vec3 solar_color = mix(solar_red, solar_orange, corona);
    solar_color = mix(solar_color, solar_core, plasma);
    solar_color = mix(solar_color, solar_white, solar_flares * 0.3);
    
    // Edge fading
    float radial_fade = 1.0 - smoothstep(0.2, 1.0, dist);
    vec2 edge_uv = abs(v_uv - 0.5) * 2.0;
    float edge_fade = (1.0 - smoothstep(0.6, 1.0, edge_uv.x)) * (1.0 - smoothstep(0.6, 1.0, edge_uv.y));
    
    float alpha = solar_density * radial_fade * edge_fade;
    
    gl_FragColor = vec4(solar_color, alpha * u_intensity);
  }
`;

// Variation 4: Quantum Field Cosmic
export const cosmicVariation4_ProductCard = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_res;
  uniform float u_intensity;

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
    vec2 uv = v_uv - 0.5;
    float t = u_time * 0.8;
    
    float aspect = u_res.x / u_res.y;
    uv.x *= aspect;
    float dist = length(uv);
    
    // Quantum field fluctuations
    float quantum1 = noise(uv * 15.0 + vec2(t * 2.0, -t * 1.5));
    float quantum2 = noise(uv * 25.0 + vec2(-t * 1.8, t * 2.2));
    float quantum3 = noise(uv * 35.0 + vec2(t * 1.2, t * 1.6));
    
    // Create quantum interference patterns
    float interference = sin(dist * 20.0 - t * 4.0) * 0.5 + 0.5;
    interference *= sin(dist * 30.0 + t * 3.0) * 0.5 + 0.5;
    
    // Quantum tunneling effect
    float tunneling = 0.0;
    for(int i = 0; i < 4; i++) {
      float offset = float(i) * 1.57; // 90 degrees apart
      vec2 tunnel_uv = uv + vec2(cos(t * 1.5 + offset) * 0.1, sin(t * 1.2 + offset) * 0.1);
      float tunnel_noise = noise(tunnel_uv * 20.0 + vec2(t * 3.0));
      tunneling += smoothstep(0.7, 1.0, tunnel_noise) * 0.25;
    }
    
    // Combine quantum effects
    float quantum_density = (quantum1 * 0.4 + quantum2 * 0.3 + quantum3 * 0.3) * interference;
    quantum_density += tunneling * 0.5;
    
    // Quantum colors - electric blues, cyans, and whites
    vec3 quantum_blue = vec3(0.0, 0.5, 1.0);
    vec3 quantum_cyan = vec3(0.0, 0.8, 0.9);
    vec3 quantum_white = vec3(1.0, 1.0, 1.0);
    vec3 quantum_electric = vec3(0.5, 0.8, 1.0);
    
    vec3 quantum_color = mix(quantum_blue, quantum_cyan, quantum1);
    quantum_color = mix(quantum_color, quantum_electric, interference * 0.6);
    quantum_color = mix(quantum_color, quantum_white, tunneling);
    
    // Edge fading
    float radial_fade = 1.0 - smoothstep(0.3, 1.0, dist);
    vec2 edge_uv = abs(v_uv - 0.5) * 2.0;
    float edge_fade = (1.0 - smoothstep(0.6, 1.0, edge_uv.x)) * (1.0 - smoothstep(0.6, 1.0, edge_uv.y));
    
    float alpha = (quantum_density * 0.7 + tunneling * 0.4) * radial_fade * edge_fade;
    
    gl_FragColor = vec4(quantum_color, alpha * u_intensity);
  }
`;

// Variation 5: Cosmic Storm
export const cosmicVariation5_ProductCard = `
  precision highp float;
  varying vec2 v_uv;
  uniform float u_time;
  uniform vec2 u_res;
  uniform float u_intensity;

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
    for(int i = 0; i < 6; i++) {
      v += a * noise(p);
      p = 2.0 * p + vec2(cos(u_time * 0.4 + float(i) * 2.0), sin(u_time * 0.3 + float(i) * 1.8));
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = v_uv - 0.5;
    float t = u_time * 0.7;
    
    float aspect = u_res.x / u_res.y;
    uv.x *= aspect;
    float dist = length(uv);
    
    // Cosmic storm clouds
    float storm1 = fbm(uv * 2.5 + vec2(t * 0.15, -t * 0.1));
    float storm2 = fbm(uv * 4.0 + vec2(-t * 0.12, t * 0.18));
    float storm3 = fbm(uv * 6.0 + vec2(t * 0.08, t * 0.14));
    
    // Lightning strikes
    float lightning = 0.0;
    for(int i = 0; i < 5; i++) {
      float offset = float(i) * 1.26; // ~72 degrees apart
      vec2 lightning_uv = uv + vec2(sin(t * 4.0 + offset) * 0.2, cos(t * 3.5 + offset) * 0.15);
      float lightning_noise = noise(lightning_uv * 18.0 + vec2(t * 6.0));
      lightning += smoothstep(0.92, 1.0, lightning_noise) * 0.2;
    }
    
    // Cosmic wind patterns
    float wind_angle = atan(uv.y, uv.x) + t * 0.5;
    float wind = sin(wind_angle * 3.0 + dist * 8.0 - t * 2.0) * 0.5 + 0.5;
    wind = pow(wind, 2.0);
    
    // Combine storm effects
    float storm_density = (storm1 * 0.4 + storm2 * 0.35 + storm3 * 0.25) * wind;
    storm_density += lightning * 0.8;
    
    // Storm colors - dark purples, electric blues, and bright whites
    vec3 storm_dark = vec3(0.1, 0.05, 0.2);
    vec3 storm_purple = vec3(0.4, 0.1, 0.6);
    vec3 storm_blue = vec3(0.2, 0.4, 0.9);
    vec3 lightning_white = vec3(1.0, 0.95, 1.0);
    
    vec3 storm_color = mix(storm_dark, storm_purple, storm1);
    storm_color = mix(storm_color, storm_blue, storm2 * 0.8);
    storm_color = mix(storm_color, lightning_white, lightning);
    
    // Add storm energy glow
    storm_color += vec3(0.3, 0.1, 0.5) * wind * 0.2;
    
    // Edge fading
    float radial_fade = 1.0 - smoothstep(0.3, 1.2, dist);
    vec2 edge_uv = abs(v_uv - 0.5) * 2.0;
    float edge_fade = (1.0 - smoothstep(0.6, 1.0, edge_uv.x)) * (1.0 - smoothstep(0.6, 1.0, edge_uv.y));
    
    float alpha = (storm_density * 0.8 + lightning * 0.3) * radial_fade * edge_fade;
    
    gl_FragColor = vec4(storm_color, alpha * u_intensity);
  }
`;
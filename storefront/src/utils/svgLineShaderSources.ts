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

  // Hash function for noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // 2D noise (value noise)
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    // Sample the original SVG texture
    vec4 svgCol = texture2D(u_texture, v_uv);
    if (svgCol.a < 0.05) {
      discard;
    }

    // Per-pixel offset so each fragment animates at a different time
    float offset = noise(v_uv * 20.0);

    // Animation cycle (0 – 1). Slower speed for subtle feel
    float speed = 0.15; // cycles per second
    float cyclePos = fract(u_time * speed + offset);

    // Length of the "visible" window within one cycle (draw then erase)
    float window = 0.45;
    float fade = 0.08;  // soft edge for drawing / erasing

    // Visibility: fade-in when entering window, fade-out when leaving
    float visIn  = smoothstep(offset, offset + fade, cyclePos);
    float visOut = 1.0 - smoothstep(offset + window - fade, offset + window, cyclePos);
    float visibility = clamp(visIn * visOut, 0.0, 1.0);

    // Apply intensity control
    visibility *= u_intensity;

    // Light grey stroke base colour
    vec3 base = vec3(0.8);

    gl_FragColor = vec4(base, svgCol.a * visibility);
  }
`; 
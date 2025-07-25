import { 
  cosmicVariation2_ProductCard, 
  cosmicVariation3_ProductCard, 
  cosmicVariation4_ProductCard, 
  cosmicVariation5_ProductCard 
} from './cosmicVariations';

export const getCosmicVariationShader = (variation: number): string => {
  switch (variation) {
    case 1:
      // Current Galactic Nebula (already implemented)
      return `
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

        float nebula(vec2 p, float t) {
          float n1 = fbm(p * 2.0 + vec2(t * 0.1, -t * 0.05));
          float n2 = fbm(p * 4.0 + vec2(-t * 0.08, t * 0.12));
          float n3 = fbm(p * 8.0 + vec2(t * 0.15, t * 0.1));
          return (n1 * 0.5 + n2 * 0.3 + n3 * 0.2);
        }

        float stars(vec2 p) {
          float n = hash(floor(p * 50.0));
          return smoothstep(0.98, 1.0, n);
        }

        void main() {
          vec2 uv = v_uv - 0.5;
          float t = u_time * 0.3;
          
          float aspect = u_res.x / u_res.y;
          uv.x *= aspect;
          float dist = length(uv);
          
          vec2 nebula_uv = uv * 1.5;
          float nebula1 = nebula(nebula_uv, t);
          float nebula2 = nebula(nebula_uv * 1.3 + vec2(100.0), t * 1.2);
          float nebula3 = nebula(nebula_uv * 0.8 + vec2(200.0), t * 0.8);
          
          float combined_nebula = (nebula1 * 0.4 + nebula2 * 0.35 + nebula3 * 0.25);
          
          float angle = atan(uv.y, uv.x) + t * 0.2 + combined_nebula * 2.0;
          vec2 spiral_uv = vec2(cos(angle), sin(angle)) * dist;
          
          float spiral = sin(angle * 3.0 + dist * 8.0 - t * 2.0) * 0.5 + 0.5;
          spiral = pow(spiral, 2.0);
          
          float star_field = stars(uv + vec2(t * 0.01, t * 0.005));
          star_field += stars(uv * 2.0 + vec2(-t * 0.008, t * 0.012)) * 0.5;
          
          float dust = fbm(uv * 6.0 + vec2(t * 0.05, -t * 0.03)) * 0.3;
          
          float cosmic_density = combined_nebula * spiral + dust;
          cosmic_density = clamp(cosmic_density, 0.0, 1.0);
          
          float alpha = smoothstep(0.2, 0.8, cosmic_density);
          alpha += star_field * 0.8;
          
          float edge_fade = 1.0 - smoothstep(0.3, 0.8, dist);
          
          vec3 deep_space = vec3(0.05, 0.02, 0.15);
          vec3 nebula_color = vec3(0.3, 0.1, 0.6);
          vec3 star_color = vec3(0.9, 0.8, 1.0);
          vec3 dust_color = vec3(0.4, 0.2, 0.8);
          
          vec3 final_color = mix(deep_space, nebula_color, combined_nebula);
          final_color = mix(final_color, dust_color, dust * 0.5);
          final_color = mix(final_color, star_color, star_field);
          
          final_color += vec3(0.1, 0.05, 0.2) * spiral * 0.3;
          
          gl_FragColor = vec4(final_color, alpha * u_intensity * edge_fade);
        }
      `;
    case 2:
      return cosmicVariation2_ProductCard;
    case 3:
      return cosmicVariation3_ProductCard;
    case 4:
      return cosmicVariation4_ProductCard;
    case 5:
      return cosmicVariation5_ProductCard;
    default:
      return getCosmicVariationShader(1);
  }
};

export const getCosmicVariationName = (variation: number): string => {
  const names = {
    1: "Galactic Nebula",
    2: "Aurora Cosmic", 
    3: "Solar Flare",
    4: "Quantum Field",
    5: "Cosmic Storm"
  };
  return names[variation as keyof typeof names] || "Galactic Nebula";
};
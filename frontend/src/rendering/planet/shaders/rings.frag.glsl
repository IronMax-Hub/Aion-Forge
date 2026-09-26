// Rings (Worlds Up Close A7): a giant's rings, lit by its star, with the
// planet's shadow across them. The mesh lies in the planet's equatorial plane;
// vLocal is a point on it in the mesh's own frame (x–y plane).

uniform float innerRadius;
uniform float outerRadius;
uniform float patternOffset;    // from the planet's VISUAL stream
uniform float icy;              // 1: bright ice (cold giant); 0: dark dust and rock
uniform vec3 ringNormal;        // world
uniform vec3 toStar;
uniform vec3 starColor;
uniform float starIntensity;
uniform float opacity;

varying vec3 vLocal;
varying vec3 vWorldPosition;

const vec3 ICE = vec3(0.78, 0.74, 0.66);
const vec3 DUST = vec3(0.30, 0.26, 0.22);
const float EDGE_SOFTNESS = 0.04;   // planet radii
const float MAX_DENSITY = 0.85;

void main() {
  float r = length(vLocal.xy);
  float across = (r - innerRadius) / (outerRadius - innerRadius);
  // Ringlets: a few incommensurate ripples, and one clear gap two-thirds of the way out
  float ripples = 0.5 + 0.25 * sin(r * 37.0 + patternOffset) + 0.15 * sin(r * 83.0 + patternOffset * 1.7)
                + 0.1 * sin(r * 151.0 + patternOffset * 2.3);
  float gap = smoothstep(0.02, 0.05, abs(across - 0.64));
  float edges = smoothstep(0.0, EDGE_SOFTNESS, r - innerRadius) * smoothstep(0.0, EDGE_SOFTNESS, outerRadius - r);
  float density = clamp(ripples, 0.0, 1.0) * gap * edges * MAX_DENSITY;
  if (density < 0.01) discard;

  // Lit through as well as on the star's side, dimmer edge-on; dark in the planet's shadow
  float lit = 0.25 + 0.75 * abs(dot(ringNormal, toStar));
  vec3 w = vWorldPosition;
  float behind = dot(w, toStar);
  float fromAxis = length(w - behind * toStar);
  float shadow = behind < 0.0 ? smoothstep(0.97, 1.03, fromAxis) : 1.0;

  vec3 colour = mix(DUST, ICE, icy) * starColor * starIntensity * lit * (0.05 + 0.95 * shadow) / 3.141592653589793;
  gl_FragColor = vec4(colour, density * opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}

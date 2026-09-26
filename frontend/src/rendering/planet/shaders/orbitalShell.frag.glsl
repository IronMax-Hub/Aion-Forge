// Orbital shell (Worlds Up Close A9): faint points around a space-age world,
// catching the starlight except where they pass through the planet's shadow
// (a cylinder of one planet radius behind it). Drawn additively.

uniform vec3 toStar;
uniform float opacity;

varying float vBrightness;
varying vec3 vWorldPosition;

const vec3 METAL = vec3(0.85, 0.88, 0.95);
const float SUNLIT = 0.55;
const float IN_SHADOW = 0.06;

void main() {
  float along = dot(vWorldPosition, toStar);
  float offAxis = length(vWorldPosition - along * toStar);
  float shadow = along < 0.0 ? 1.0 - smoothstep(0.97, 1.03, offAxis) : 0.0;
  float disc = smoothstep(0.5, 0.2, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(METAL * vBrightness, disc * mix(SUNLIT, IN_SHADOW, shadow) * opacity);
}

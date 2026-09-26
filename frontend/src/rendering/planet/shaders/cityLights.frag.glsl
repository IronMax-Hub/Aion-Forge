// City lights (Worlds Up Close A9): warm points, seen only on the night side,
// fading in across the terminator. Drawn additively.

uniform vec3 toStar;
uniform float opacity;

varying float vBrightness;
varying vec3 vWorldPosition;

// Sodium-lamp orange, linear
const vec3 LAMP = vec3(1.0, 0.62, 0.25);
// The lights come on from the terminator to this far into the night (cosine of the sun's angle)
const float DUSK = 0.15;

void main() {
  float night = smoothstep(0.02, -DUSK, dot(normalize(vWorldPosition), toStar));
  float disc = smoothstep(0.5, 0.15, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(LAMP * vBrightness, disc * night * opacity);
}

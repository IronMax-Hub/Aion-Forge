// Point layers of life seen from orbit (Worlds Up Close A9): city lights and
// the orbital shell. The planet sits at the world's origin, so a point's world
// position is also its direction from the planet's centre.

attribute float brightness;
uniform float pointSize;        // pixels

varying float vBrightness;
varying vec3 vWorldPosition;

void main() {
  vBrightness = brightness;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  gl_PointSize = pointSize;
}

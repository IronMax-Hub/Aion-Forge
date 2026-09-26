// Globe (Worlds Up Close A5): passes each point's direction in the planet's own
// frame, where the surface map is laid out, and its position in the world.

varying vec3 vLocal;
varying vec3 vWorldPosition;

void main() {
  vLocal = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}

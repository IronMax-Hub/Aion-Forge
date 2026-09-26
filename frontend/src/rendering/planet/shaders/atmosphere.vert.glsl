// Atmosphere shell and cloud sphere (Worlds Up Close A6): pass each point's
// direction in the mesh's own frame and its position in the world.

varying vec3 vLocal;
varying vec3 vWorldPosition;

void main() {
  vLocal = position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}

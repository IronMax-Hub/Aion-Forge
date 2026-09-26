// Globe bake (Worlds Up Close A5): one quad over the whole atlas; the fragment
// shader works out each texel's direction from its pixel position.

void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}

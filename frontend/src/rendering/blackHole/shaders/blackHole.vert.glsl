// Black hole close-up: one quad over the whole view; the fragment shader traces each pixel.

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}

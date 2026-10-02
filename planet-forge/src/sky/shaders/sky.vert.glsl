// The sky (PF4): a quad over the whole screen, behind everything else, passing
// each pixel's view direction on. The camera sits at the origin (camera-relative
// drawing), so a point the pixel shows is also its direction.

uniform mat4 screenToWorld;   // the camera's world matrix times its inverse projection

varying vec3 vDirection;

void main() {
  vec4 near = screenToWorld * vec4(position.xy, -1.0, 1.0);
  vDirection = near.xyz / near.w;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}

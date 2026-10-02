// The sky (PF4): the light the air scatters towards the camera
// (atmosphere.glsl), and the star's disc, dimmed by the air in front of it.
// The disc is drawn at least a few pixels wide (GroundRenderer), with the same total light,
// so a distant star still shows; its edge is softened over one pixel.

uniform float discRadius;    // the disc's drawn angular radius, radians
uniform float pixelAngle;    // one pixel's angular size, radians

varying vec3 vDirection;

void main() {
  vec3 d = normalize(vDirection);
  vec3 colour = skyRadiance(d);

  float r = length(cameraBody);
  float b = dot(cameraBody, d);
  float inner = b * b - (r * r - planetRadius * planetRadius);
  bool meetsGround = inner > 0.0 && -b - sqrt(inner) > 0.0;
  float angle = acos(clamp(dot(d, sunDirection), -1.0, 1.0));
  if (!meetsGround && angle < discRadius + pixelAngle) {
    float solidAngle = 2.0 * ATMOSPHERE_PI * (1.0 - cos(discRadius));
    float cover = 1.0 - smoothstep(discRadius - 0.5 * pixelAngle, discRadius + 0.5 * pixelAngle, angle);
    colour += sunIrradiance * transmittanceOf(columnsToSpace(cameraBody, d)) * cover / solidAngle;
  }
  gl_FragColor = vec4(colour, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}

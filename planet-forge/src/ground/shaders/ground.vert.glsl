// The ground (PF4): per vertex, the starlight that gets through the air to it,
// the sky's light on it, and the haze between it and the camera
// (atmosphere.glsl). Positions are relative to the patch's origin, and the
// patch is placed relative to the camera (camera-relative drawing).

#include <common>
#include <logdepthbuf_pars_vertex>

attribute float glow;

varying vec3 vColour;
varying float vGlow;
varying vec3 vNormal;
varying vec3 vSun;
varying vec3 vSky;
varying vec3 vThrough;
varying vec3 vHaze;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec3 body = cameraBody + world.xyz;
  vSun = sunIrradiance * sunTransmittance(body);
  vSky = skyLightOn(dot(normalize(body), sunDirection));
  hazeTo(body, vThrough, vHaze);
  vColour = color;
  vGlow = glow;
  vNormal = normal;
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}

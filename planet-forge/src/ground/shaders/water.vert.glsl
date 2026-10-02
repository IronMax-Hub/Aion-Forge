// Water at sea level (PF3): passes the water's depth, sea ice and the vertex's
// place to the fragment shader; and (PF4) the starlight that gets through the
// air, the sky's light and the haze, as the ground's (atmosphere.glsl).
// Positions are relative to the patch's origin, and the patch is placed
// relative to the camera (camera-relative drawing).

#include <common>
#include <logdepthbuf_pars_vertex>

attribute float depth;
attribute float seaIce;

uniform vec3 origin;        // the patch's origin, m from the planet's centre (for "up")
uniform vec3 rippleOrigin;  // the origin modulo the ripples' repeat, so ripples line up across patches

varying float vDepth;
varying float vSeaIce;
varying vec3 vUp;
varying vec3 vRipple;
varying vec3 vToCamera;
varying vec3 vSun;
varying vec3 vSky;
varying vec3 vThrough;
varying vec3 vHaze;

void main() {
  vDepth = depth;
  vSeaIce = seaIce;
  vUp = normalize(origin + position);
  vRipple = rippleOrigin + position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vToCamera = -world.xyz;   // the camera is at the origin
  vec3 body = cameraBody + world.xyz;
  vSun = sunIrradiance * sunTransmittance(body);
  vSky = skyLightOn(dot(vUp, sunDirection));
  hazeTo(body, vThrough, vHaze);
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}

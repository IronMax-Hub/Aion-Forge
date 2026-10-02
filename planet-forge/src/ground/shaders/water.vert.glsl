// Water at sea level (PF3): passes the water's depth, sea ice and the vertex's
// place to the fragment shader. Positions are relative to the patch's origin,
// and the patch is placed relative to the camera (camera-relative drawing).

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

void main() {
  vDepth = depth;
  vSeaIce = seaIce;
  vUp = normalize(origin + position);
  vRipple = rippleOrigin + position;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vToCamera = -world.xyz;   // the camera is at the origin
  gl_Position = projectionMatrix * viewMatrix * world;
  #include <logdepthbuf_vertex>
}

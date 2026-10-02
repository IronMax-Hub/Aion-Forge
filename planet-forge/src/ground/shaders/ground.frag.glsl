// The ground (PF4): Lambert lighting of the vertex colours by the starlight
// that gets through the air and by the sky's light, molten ground's glow added,
// then dimmed and hazed by the air between it and the camera.

#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 glowColour;
uniform float nightLight;   // light where neither star nor sky reaches, until the night sky is drawn

varying vec3 vColour;
varying float vGlow;
varying vec3 vNormal;
varying vec3 vSun;
varying vec3 vSky;
varying vec3 vThrough;
varying vec3 vHaze;

void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vNormal);
  vec3 light = vSun * max(dot(n, sunDirection), 0.0) + vSky + nightLight;
  vec3 colour = vColour * light / PI + glowColour * vGlow;
  gl_FragColor = vec4(colour * vThrough + vHaze, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}

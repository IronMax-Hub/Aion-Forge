// Water at sea level (PF3): its colour by depth, the sky reflected by Fresnel,
// the star's glint, and small moving ripples; sea ice is flat, lit ice. The
// light (PF4): the starlight that gets through the air and the sky's light,
// the sky reflected from the sky table, then the haze to the camera
// (atmosphere.glsl). Presentation only.

#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 shallowColour;
uniform vec3 deepColour;
uniform vec3 seaIceColour;
uniform float nightLight;   // as the ground's
uniform float time;

varying float vDepth;
varying float vSeaIce;
varying vec3 vUp;
varying vec3 vRipple;
varying vec3 vToCamera;
varying vec3 vSun;
varying vec3 vSky;
varying vec3 vThrough;
varying vec3 vHaze;

// Water darkens to its deepest colour over this depth, m
const float DEEP_M = 200.0;
// Ripples: strength, and the distance they fade out over (their wavelengths, below, divide GroundRenderer's RIPPLE_REPEAT_M)
const float RIPPLE_STRENGTH = 0.04;
const float RIPPLE_FADE_M = 400.0;
const float GLINT_SHARPNESS = 400.0;
const float F0 = 0.02;

void main() {
  #include <logdepthbuf_fragment>
  if (vDepth <= 0.0) discard;

  vec3 up = normalize(vUp);
  vec3 toCamera = normalize(vToCamera);
  float distance = length(vToCamera);

  if (vSeaIce > 0.5) {
    vec3 light = vSun * max(dot(up, sunDirection), 0.0) + vSky + nightLight;
    gl_FragColor = vec4(seaIceColour * light / PI * vThrough + vHaze, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }

  // Three sets of waves, each a whole number of times across the ripple repeat (1,000 m)
  vec3 p = vRipple;
  vec3 slope = vec3(0.0);
  slope += vec3(0.7, 0.0, 0.7) * cos(dot(p, vec3(0.7, 0.0, 0.7)) * (6.2832 / 10.0) + time * 1.3);
  slope += vec3(0.0, 0.8, -0.6) * cos(dot(p, vec3(0.0, 0.8, -0.6)) * (6.2832 / 4.0) + time * 2.1);
  slope += vec3(-0.6, 0.6, 0.5) * cos(dot(p, vec3(-0.6, 0.6, 0.5)) * (6.2832 / 2.0) + time * 2.9);
  slope -= up * dot(slope, up);
  vec3 normal = normalize(up + RIPPLE_STRENGTH * slope * (1.0 - smoothstep(0.0, RIPPLE_FADE_M, distance)));

  vec3 water = mix(shallowColour, deepColour, smoothstep(0.0, DEEP_M, vDepth));
  vec3 light = vSun * max(dot(normal, sunDirection), 0.0) + vSky + nightLight;
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - max(dot(normal, toCamera), 0.0), 5.0);
  vec3 reflected = reflect(-toCamera, normal);
  float glint = pow(max(dot(reflected, sunDirection), 0.0), GLINT_SHARPNESS) * step(0.0, dot(up, sunDirection));

  vec3 colour = mix(water * light / PI, skyRadiance(reflected), fresnel) + vSun / PI * glint * 4.0;
  gl_FragColor = vec4(colour * vThrough + vHaze, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}

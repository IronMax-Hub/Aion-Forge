// Atmosphere shell (Worlds Up Close A6): starlight scattered once by the air,
// added over the planet and the sky around it.
//
// Each pixel's view ray is followed through the shell (radius shellRadius around
// the planet at the origin, stopping at the surface, radius 1). Its length in
// shell thicknesses is the air mass it crosses: 1 looking straight down, ~20
// grazing the limb, which is why the rim glows. Per colour channel the ray
// scatters 1 − exp(−τ · air mass) of the starlight, with τ the zenith optical
// depth (Rayleigh: stronger for blue, in proportion to pressure; atmosphere.ts).
// Thin air scatters blue at the limb; thick air saturates towards the star's own
// colour, and a red star's light has little blue to scatter to begin with.
// Light scattered more than once mixes the colours back together, so real skies
// are paler than single scattering gives; a share of the light is taken as that
// mixed, grey part (without it, a hot blue star's rim is a pure display blue,
// which tone mapping turns violet).

uniform float shellRadius;
uniform vec3 zenithDepth;       // Rayleigh optical depth straight down, red, green, blue
uniform vec3 toStar;
uniform vec3 starColor;       // the star's spectrum in red, green, blue (starSpectrumRGB)
uniform float starIntensity;
uniform float opacity;

varying vec3 vWorldPosition;

// Share of the scattered light sent on towards the viewer: single scattering
// with an isotropic phase, before the 1/π the surface's lighting also uses
const float SCATTER_BRIGHTNESS = 0.35;
// Share of the scattered light that has scattered more than once, its colours mixed
const float MULTIPLE_SCATTERING = 0.35;
// The lit side of the air reaches this far past the terminator (twilight)
const float TWILIGHT = 0.2;

void main() {
  vec3 origin = cameraPosition;
  vec3 direction = normalize(vWorldPosition - cameraPosition);
  float b = dot(origin, direction);
  float c = dot(origin, origin);
  float outer = b * b - (c - shellRadius * shellRadius);
  if (outer <= 0.0) discard;
  float enter = max(0.0, -b - sqrt(outer));
  float leave = -b + sqrt(outer);
  float inner = b * b - (c - 1.0);
  if (inner > 0.0 && -b - sqrt(inner) > 0.0) leave = -b - sqrt(inner);   // stops at the ground
  float airMass = max(0.0, leave - enter) / (shellRadius - 1.0);

  vec3 middle = normalize(origin + direction * (enter + leave) * 0.5);
  float lit = smoothstep(-TWILIGHT, TWILIGHT, dot(middle, toStar));

  vec3 single = (1.0 - exp(-zenithDepth * airMass)) * starColor;
  vec3 mixed = vec3(dot(single, vec3(0.2126, 0.7152, 0.0722)));
  vec3 scattered = mix(single, mixed, MULTIPLE_SCATTERING) * starIntensity * SCATTER_BRIGHTNESS * lit / 3.141592653589793;
  gl_FragColor = vec4(scattered * opacity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}

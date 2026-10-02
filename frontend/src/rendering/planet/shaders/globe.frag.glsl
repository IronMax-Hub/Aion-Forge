// Globe (Worlds Up Close A5, A7): draws a planet from its baked atlas
// (globeBake.frag.glsl for solid planets, giantBake.frag.glsl for giants) and
// lights it with its own star. Prefixed with the cube atlas GLSL. Everything
// expensive was worked out once, when the planet was baked; each frame reads two
// textures and lights them, which old GPUs manage. Glowing ground and hot giants
// add their own light (the relief atlas's alpha), seen best on the night side.
// Molten ground shimmers in the day's heat: a slight, moving wobble in where the
// atlas is read, off under reduced motion (presentation only). The system view,
// with no cloud sphere, draws the baked clouds on the ground (cloudsOnGround).

uniform sampler2D albedoAtlas;  // surface colour (square root) and glint share
uniform sampler2D reliefAtlas;  // RG: relief tilt; B: clouds (not read here); A: glow

uniform mat3 localToWorld;      // the globe's orientation
uniform vec3 toStar;            // world direction to the star
uniform vec3 starColor;
uniform float starIntensity;
uniform float nightFill;
uniform float opacity;
uniform vec3 glowColour;        // colour of the planet's own light: blackbody at its heat
uniform float glowIntensity;
uniform float shimmer;          // 0–1: heat shimmer strength (0 under reduced motion)
uniform float timeSeconds;
uniform float cloudsOnGround;   // 1: draw the baked clouds on the ground (system view); 0: the cloud sphere does (planet view)

varying vec3 vLocal;
varying vec3 vWorldPosition;

const float PI = 3.141592653589793;

// The cloud sphere's colour (clouds.frag.glsl)
const vec3 CLOUD_ALBEDO = vec3(0.8);

// Lighting
const float TERMINATOR_WRAP = 0.08;   // light reaches this far past the geometric terminator
const float GLINT_SHARPNESS = 300.0;
const float GLINT_STRENGTH = 0.25;

// Radians across one atlas texel, near a face's centre
const float TEXEL_ANGLE = 2.0 / FACE_SIZE;

// Heat shimmer: how far (radians) and how finely the view wobbles
const float SHIMMER_ANGLE = 0.0012;
const float SHIMMER_FREQUENCY = 90.0;

void main() {
  vec3 p = normalize(vLocal);
  float dayside = max(0.0, dot(normalize(localToWorld * p), toStar));
  if (shimmer > 0.0) {
    vec3 wobble = sin(p.yzx * SHIMMER_FREQUENCY + timeSeconds * vec3(2.9, 3.7, 3.1))
                * sin(p.zxy * SHIMMER_FREQUENCY * 0.7 - timeSeconds * vec3(2.3, 1.9, 2.6));
    p = normalize(p + SHIMMER_ANGLE * shimmer * dayside * wobble);
  }
  vec3 faceU;
  vec2 uv = atlasCoordinates(p, faceU);
  // Level of detail from how much surface a pixel covers: the atlas coordinates
  // jump at face edges, so their own screen derivatives would pick the wrong level there
  float lod = max(0.0, log2(length(fwidth(p)) / TEXEL_ANGLE));
  vec4 surface = textureLod(albedoAtlas, uv, lod);
  vec3 albedo = surface.rgb * surface.rgb;
  float glintShare = surface.a;
  vec4 relief = textureLod(reliefAtlas, uv, lod);
  vec3 normalLocal = decodeNormal(p, faceU, relief.rg);
  // Clouds on the ground hide its colour, relief and glint
  float cloud = relief.b * cloudsOnGround;
  albedo = mix(albedo, CLOUD_ALBEDO, cloud);
  normalLocal = normalize(mix(normalLocal, p, cloud));
  glintShare *= 1.0 - cloud;

  vec3 normal = normalize(localToWorld * normalLocal);
  vec3 sphereNormal = normalize(localToWorld * p);
  float facing = dot(sphereNormal, toStar);
  float diffuse = clamp((dot(normal, toStar) + TERMINATOR_WRAP) / (1.0 + TERMINATOR_WRAP), 0.0, 1.0)
                * smoothstep(-TERMINATOR_WRAP, TERMINATOR_WRAP, facing);

  // The star's glint on open water
  vec3 toCamera = normalize(cameraPosition - vWorldPosition);
  vec3 halfway = normalize(toStar + toCamera);
  float glint = pow(max(dot(sphereNormal, halfway), 0.0), GLINT_SHARPNESS) * GLINT_STRENGTH
              * glintShare * smoothstep(0.0, 0.1, facing);

  vec3 starlight = starColor * starIntensity;
  vec3 colour = albedo * (starlight * diffuse / PI + nightFill) + starlight * glint
              + glowColour * glowIntensity * relief.a;

  gl_FragColor = vec4(colour, opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}

// Globe (Worlds Up Close A5): draws a solid planet from its baked atlas
// (globeBake.frag.glsl) and lights it with its own star. Prefixed with the cube
// atlas GLSL. Everything expensive was worked out once, when the planet was
// baked; each frame reads two textures and lights them, which old GPUs manage.

uniform sampler2D albedoAtlas;  // surface colour (square root) and glint share
uniform sampler2D reliefAtlas;  // surface normal in the planet's frame, 0–1 encoded

uniform mat3 localToWorld;      // the globe's orientation
uniform vec3 toStar;            // world direction to the star
uniform vec3 starColor;
uniform float starIntensity;
uniform float nightFill;
uniform float opacity;

varying vec3 vLocal;
varying vec3 vWorldPosition;

const float PI = 3.141592653589793;

// Lighting
const float TERMINATOR_WRAP = 0.08;   // light reaches this far past the geometric terminator
const float GLINT_SHARPNESS = 300.0;
const float GLINT_STRENGTH = 0.25;

// Radians across one atlas texel, near a face's centre
const float TEXEL_ANGLE = 2.0 / FACE_SIZE;

void main() {
  vec3 p = normalize(vLocal);
  vec2 uv = atlasCoordinates(p);
  // Level of detail from how much surface a pixel covers: the atlas coordinates
  // jump at face edges, so their own screen derivatives would pick the wrong level there
  float lod = max(0.0, log2(length(fwidth(p)) / TEXEL_ANGLE));
  vec4 surface = textureLod(albedoAtlas, uv, lod);
  vec3 albedo = surface.rgb * surface.rgb;
  float glintShare = surface.a;
  vec3 normalLocal = normalize(textureLod(reliefAtlas, uv, lod).rgb * 2.0 - 1.0);

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
  vec3 colour = albedo * (starlight * diffuse / PI + nightFill) + starlight * glint;

  gl_FragColor = vec4(colour, opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}

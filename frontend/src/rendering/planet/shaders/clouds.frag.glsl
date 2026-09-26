// Cloud sphere (Worlds Up Close A6): the cloud density baked with the surface
// (relief atlas, blue; globeBake.frag.glsl), drawn on a sphere just above the
// ground and lit by the star. The sphere turns slowly about the planet's pole:
// the drift is presentation only. Prefixed with the cube atlas GLSL.

uniform sampler2D reliefAtlas;  // blue: cloud density
uniform vec3 toStar;
uniform vec3 starColor;
uniform float starIntensity;
uniform float nightFill;
uniform float opacity;

varying vec3 vLocal;
varying vec3 vWorldPosition;

const vec3 CLOUD_ALBEDO = vec3(0.8);
const float TERMINATOR_WRAP = 0.12;   // clouds catch light a little past the terminator
const float TEXEL_ANGLE = 2.0 / FACE_SIZE;

void main() {
  vec3 p = normalize(vLocal);
  float lod = max(0.0, log2(length(fwidth(p)) / TEXEL_ANGLE));
  float density = textureLod(reliefAtlas, atlasCoordinates(p), lod).b;
  if (density < 0.01) discard;

  float facing = dot(normalize(vWorldPosition), toStar);
  float diffuse = clamp((facing + TERMINATOR_WRAP) / (1.0 + TERMINATOR_WRAP), 0.0, 1.0);
  vec3 colour = CLOUD_ALBEDO * (starColor * starIntensity * diffuse / 3.141592653589793 + nightFill);

  gl_FragColor = vec4(colour, density * opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}

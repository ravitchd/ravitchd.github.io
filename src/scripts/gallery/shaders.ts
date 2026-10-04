// Shaders for one photo tile. The quad is bigger than the photo by uMargin on every side,
// so the soft drop shadow can be drawn in that margin. All sizes are in CSS pixels.

export const vertexShader = /* glsl */ `
uniform float uBend;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  // Push points away from the middle of the screen back in depth, so a fast-moving wall
  // bows like a lens.
  world.z -= dot(world.xy, world.xy) * uBend;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const fragmentShader = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uImage;    // photo size, for cover-fitting
uniform vec2 uPlane;    // size of the photo area on screen
uniform float uMargin;
uniform float uRadius;
uniform float uAlpha;
uniform float uHover;
uniform float uDim;
uniform float uFog;
uniform float uReflect;
uniform float uShadow;
uniform vec3 uBg;
uniform vec2 uVel;      // colour split along the direction of motion
uniform vec2 uShift;    // parallax of the photo inside its frame
uniform vec2 uMouse;    // cursor position on the tile, 0..1
uniform float uTime;

varying vec2 vUv;

float sdRound(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec2 cover(vec2 uv) {
  float rp = uPlane.x / uPlane.y;
  float ri = uImage.x / uImage.y;
  vec2 s = rp < ri ? vec2(rp / ri, 1.0) : vec2(1.0, ri / rp);
  return (uv - 0.5) * s + 0.5;
}

void main() {
  vec2 full = uPlane + 2.0 * uMargin;
  vec2 p = (vUv - 0.5) * full;

  float d = sdRound(p, uPlane * 0.5, uRadius);
  float aa = max(fwidth(d), 0.35);
  float inside = 1.0 - smoothstep(-aa, aa, d);

  // Soft shadow under the photo; it grows and drops a little when the tile is lifted.
  float off = uMargin * 0.16 + uMargin * 0.2 * uHover;
  float reach = uMargin + 2.0 - off;
  float ds = sdRound(p + vec2(0.0, off), uPlane * 0.5 - 4.0, uRadius + 4.0);
  float shadow = 1.0 - smoothstep(-reach * 0.4, reach, ds);
  shadow = shadow * shadow * uShadow * (1.0 + 0.7 * uHover) * (1.0 - uFog);

  vec3 col = vec3(0.0);
  if (inside > 0.0) {
    vec2 uv = p / uPlane + 0.5;
    if (uReflect > 0.5) uv.y = 1.0 - uv.y;
    if (!gl_FrontFacing) uv.x = 1.0 - uv.x;

    // A gentle loupe and ripple around the cursor while hovered.
    vec2 dm = (uv - uMouse) * vec2(uPlane.x / uPlane.y, 1.0);
    float dist = length(dm);
    float near = 1.0 - smoothstep(0.0, 0.55, dist);
    float wave = sin(dist * 38.0 - uTime * 4.5) * 0.0045 * uHover * near;
    uv += (dm / max(dist, 1e-4)) * wave * vec2(uPlane.y / uPlane.x, 1.0);
    uv = mix(uv, uMouse, 0.045 * uHover * near);

    vec2 c = (cover(uv) - 0.5) * (0.88 - 0.05 * uHover) + 0.5 + uShift;
    col.r = texture2D(uTex, c + uVel).r;
    col.g = texture2D(uTex, c).g;
    col.b = texture2D(uTex, c - uVel).b;

    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(lum), uDim * 0.75);
    float fog = uFog + (gl_FrontFacing ? 0.0 : 0.22);
    col = mix(col, uBg, clamp(uDim * 0.35 + fog, 0.0, 1.0));
    col += uHover * 0.02;
  }

  float a = inside;
  if (uReflect > 0.5) a *= smoothstep(0.45, 1.0, vUv.y) * 0.32;
  float outA = a + shadow * (1.0 - a);
  vec3 outC = col * a / max(outA, 1e-4);
  gl_FragColor = vec4(outC, outA * uAlpha);
  if (gl_FragColor.a < 0.003) discard;
}
`;

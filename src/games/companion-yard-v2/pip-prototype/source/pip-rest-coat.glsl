// Engine-neutral base-color helper for the pinned private Pip R1/A2 GLB.
// Uncompiled and unqualified on a browser GPU. No illumination or SSS is baked.
//
// Vertex stage, before skinning/model/world transforms:
//   varying vec3 vPipRestPosition; // use out/in for GLSL ES 3 as appropriate
//   vPipRestPosition = vec3(position.x, -position.z, position.y);
//
// The existing POSITION is a rest-pose attribute in glTF Y-up coordinates.
// This assignment recovers the source Z-up PipRestPosition and transports it
// through the same interpolation as the source material. It adds no vertex
// buffer: reuse POSITION rather than evaluate the coat per vertex.
//
// Fragment stage: use highp float. Set the BODY's linear base RGB to
// pipApprovedCoat(vPipRestPosition), replacing baseColorFactor * COLOR_0.
// Do not multiply the baked fallback COLOR_0 into the analytical result.
// Preserve material opacity and the engine's PBR lighting/tone mapping.
// Other six materials are unchanged. Source subsurface scattering still needs
// a separate explicit material decision; this function reproduces base color.

float pipSmooth(float a, float b, float x) {
    // GLSL smoothstep(a,b,x) is undefined when a >= b. The source has reversed
    // ramps, so use its explicit clamped normalized polynomial instead.
    float t = clamp((x - a) / (b - a), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

float pipEllipse(vec3 p, vec2 center, vec2 radius) {
    vec2 q = (p.xz - center) / radius;
    return dot(q, q);
}

vec3 pipApprovedCoat(vec3 p) {
    float d = pipEllipse(p, vec2(0.0, 0.255), vec2(0.351, 0.375));
    d = min(d, pipEllipse(p, vec2(0.0, 0.484), vec2(0.260, 0.165)));
    d = min(d, pipEllipse(p, vec2(-0.147, 0.615), vec2(0.181, 0.067)));
    d = min(d, pipEllipse(p, vec2(0.147, 0.615), vec2(0.181, 0.067)));
    d = min(d, pipEllipse(p, vec2(0.0, 0.651), vec2(0.085, 0.044)));
    float front = pipSmooth(0.020, -0.095, p.y);
    float coat = (1.0 - pipSmooth(0.955, 1.045, d)) * front;
    float ax = abs(p.x);
    vec2 armQ = vec2((ax - 0.333) / 0.076, (p.z - 0.455) / 0.111);
    float arm = (1.0 - pipSmooth(0.600, 1.200, dot(armQ, armQ)))
        * pipSmooth(-0.065, -0.160, p.y);
    coat *= 1.0 - arm;
    // Exactly the source sRGB hex palette converted once to linear RGB.
    const vec3 orange = vec3(1.0, 0.3712376804741491, 0.026241221894849898);
    const vec3 cream = vec3(1.0, 0.8713671191987972, 0.6583748172794485);
    const vec3 pink = vec3(0.9046611743911496, 0.3662525955988395, 0.29177064981753587);
    vec3 color = mix(orange, cream, coat);
    vec2 blushQ = vec2((ax - 0.199) / 0.050, (p.z - 0.642) / 0.022);
    float blush = (1.0 - pipSmooth(0.050, 1.350, dot(blushQ, blushQ))) * front * 0.57;
    return mix(color, pink, blush);
}

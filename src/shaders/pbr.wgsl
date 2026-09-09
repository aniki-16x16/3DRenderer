struct VertextIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) tangent: vec4f,
}

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) world_position: vec3f,
  @location(1) uv: vec2f,
  @location(2) n_world: vec3f,
}

struct CameraUniforms {
  vp_matrix: mat4x4f,
  position: vec3f,
  light_count: u32,
}

struct MaterialUniforms {
  base_color: vec4f,
  metallic: f32,
  roughness: f32,
  padding: vec2f,
}

struct LightData {
  position: vec3f,
  light_type: u32, // 0: 点光源, 1: 平行光, 2: 聚光灯
  color: vec3f,
  intensity: f32,
  direction: vec3f,
  range: f32,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> lights: array<LightData>;
@group(0) @binding(2) var<uniform> u_time: f32;
@group(0) @binding(3) var linear_sampler: sampler;
@group(0) @binding(4) var shadow_map: texture_depth_2d;
@group(0) @binding(5) var shadow_sampler: sampler_comparison;
@group(0) @binding(6) var<uniform> shadowVPMatrix: mat4x4f;
@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(2) @binding(0) var<uniform> model: mat4x4f;

@vertex
fn vs_main(input: VertextIn) -> VertexOut {
  var output: VertexOut;
  // 注意矩阵乘法顺序: P * V * M * pos
  let world_position = model * vec4f(input.position, 1);
  output.position = camera.vp_matrix * world_position;
  output.world_position = world_position.xyz;
  output.uv = input.uv;
  output.n_world = normalize((model * vec4f(input.normal, 0)).xyz);
  return output;
}

const PI = 3.1415926535897932384626433;

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4f {
  var acc = vec3f(0);
  for (var i: u32 = 0; i < camera.light_count; i += 1) {
    let light = lights[i];
    let N = normalize(input.n_world);
    let L = -light.direction;
    let V = normalize(camera.position - input.world_position);
    let H = normalize(V + L);
    let NoV = clamp(dot(N, V), 0, 1);
    let NoL = clamp(dot(N, L), 0, 1);

    let F = fresnelSchlick(V, H);
    let D = distributionGGX(N, H);
    let G = geometrySmith(NoV, NoL);
    let specular = D * G * F / max(4 * NoV * NoL, 1e-4);
    let ks = F;
    let kd = (1 - ks) * (1 - material.metallic);
    let diffuse = kd * material.base_color.rgb / PI;

    let Li = light.color * light.intensity;
    let Lo = (diffuse + specular) * Li * NoL;
    acc += select(vec3f(0, 0, 0), Lo, NoV > 0 && NoL > 0);
  }

  let exposure = 1.0 + u_time * 0.5;
  let linear_result = tone_mapping(acc * exposure);
  return vec4f(color2sRGB(linear_result), 1);
}

fn tone_mapping(x: vec3f) -> vec3f {
  return x / (x + 1);
}

fn sRGB_helper(x: f32) -> f32 {
  return select(12.92 * x, 1.055 * pow(x, 1 / 2.4) - 0.055, x > 0.0031308);
}

fn color2sRGB(color: vec3f) -> vec3f {
  return vec3f(sRGB_helper(color.r), sRGB_helper(color.g), sRGB_helper(color.b));
}

fn fresnelSchlick(V: vec3f, H: vec3f) -> vec3f {
  let F0 = mix(vec3f(0.04), material.base_color.rgb, material.metallic);
  let F = F0 + (vec3f(1) - F0) * pow(1 - clamp(dot(V, H), 0, 1), 5.0);
  return F;
}

fn distributionGGX(N: vec3f, H: vec3f) -> f32 {
  let r = max(material.roughness, 0.05);
  let a = r * r;
  let a2 = a * a;

  let NoH = clamp(dot(N, H), 0, 1);
  let denominatorBase = NoH * NoH * (a2 - 1) + 1;
  let D = a2 / (PI * denominatorBase * denominatorBase);
  return D;
}

fn geometrySmith(NoV: f32, NoL: f32) -> f32 {
  let k = pow(1 + material.roughness, 2.0) / 8.0;
  let Gv = NoV / (NoV * (1 - k) + k);
  let Gl = NoL / (NoL * (1 - k) + k);
  let G = Gv * Gl;
  return G;
}

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
@group(0) @binding(7) var environment_map: texture_2d<f32>;
@group(0) @binding(8) var environment_sampler: sampler;
@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(2) @binding(0) var<uniform> model: mat4x4f;

const PI = 3.1415926535897932384626433;

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

const SAMPLES = 10u;

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4f {
  // var acc = vec3f(0);
  // for (var i: u32 = 0; i < camera.light_count; i += 1) {
  //   let light = lights[i];
  //   let N = normalize(input.n_world);
  //   let L = -light.direction;
  //   let V = normalize(camera.position - input.world_position);
  //   let H = normalize(V + L);
  //   let NoV = clamp(dot(N, V), 0, 1);
  //   let NoL = clamp(dot(N, L), 0, 1);

  //   let F = fresnelSchlick(V, H);
  //   let D = distributionGGX(N, H);
  //   let G = geometrySmith(NoV, NoL);
  //   let specular = D * G * F / max(4 * NoV * NoL, 1e-4);
  //   let ks = F;
  //   let kd = (1 - ks) * (1 - material.metallic);
  //   let diffuse = kd * material.base_color.rgb / PI;

  //   let Li = light.color * light.intensity;
  //   let Lo = (diffuse + specular) * Li * NoL;
  //   acc += select(vec3f(0, 0, 0), Lo, NoV > 0 && NoL > 0);
  // }
  // return vec4f(acc, 1);
  let N = normalize(input.n_world);
  let A = get_assist_axis(N);
  let T = normalize(cross(A, N));
  let B = cross(N, T);
  var acc = vec3f(0);
  for (var i: u32 = 0; i < SAMPLES; i += 1) {
    let pixel = floor(input.position.xy);
    let u1 = random31(vec3f(pixel, f32(2u * i)));
    let u2 = random31(vec3f(pixel, f32(2u * i + 1u)));
    let r = sqrt(u1);
    let phi = 2.0 * PI * u2;
    let x = cos(phi) * r;
    let y = sin(phi) * r;
    let z = sqrt(1 - u1);
    let dir_world = x * T + y * B + z * N;
    var u = 0.0;
    if (abs(dir_world.x) > 0 || abs(dir_world.z) > 0) {
      u = atan2(dir_world.z, dir_world.x) / PI * 0.5 + 0.5;
    }
    let v = acos(clamp(dir_world.y, -1, 1)) / PI;
    acc += textureSample(environment_map, environment_sampler, vec2f(u, v)).rgb;
  }
  acc = material.base_color.rgb / f32(SAMPLES) * acc;

  let V = normalize(camera.position - input.world_position);
  let R = 2.0 * dot(N, V) * N - V;
  return vec4f(acc, 1);
}

// 通用整数混合；u32 运算溢出时按模 2^32 回绕。
fn random_mix_u32(value: u32) -> u32 {
  var h = value;
  h = (h ^ (h >> 16u)) * 0x7feb352du;
  h = (h ^ (h >> 15u)) * 0x846ca68bu;
  return h ^ (h >> 16u);
}

// 确定性伪随机哈希：相同种子始终得到相同结果。
// seed 使用有限浮点数；输出近似均匀分布于 [0, 1)，不用于密码学。
fn random31(seed: vec3f) -> f32 {
  let bits = bitcast<vec3u>(seed);
  var h = random_mix_u32(bits.x ^ 0x9e3779b9u);
  h = random_mix_u32(h ^ bits.y);
  h = random_mix_u32(h ^ bits.z);
  // 只取高 24 位，保证 f32 转换精确且不会舍入到 1。
  return f32(h >> 8u) * (1.0 / 16777216.0);
}

fn get_assist_axis(n: vec3f) -> vec3f {
  let abs_n = abs(n);
  var result = vec3f(0);
  if (abs_n.x <= abs_n.y && abs_n.x < abs_n.z) {
    result = vec3f(1,0,0);
  } else if (abs_n.y <= abs_n.x && abs_n.y < abs_n.z) {
    result = vec3f(0,1,0);
  } else {
    result = vec3f(0,0,1);
  }
  return result;
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

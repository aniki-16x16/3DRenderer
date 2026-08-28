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
  @location(2) t_world: vec3f,
  @location(3) b_world: vec3f,
  @location(4) n_world: vec3f,
}

struct CameraUniforms {
  vp_matrix: mat4x4f,
  position: vec3f,
  padding: f32,
}

struct MaterialUniforms {
  color: vec4f,
  spec_color: vec3f,
  shininess: f32,
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
@group(0) @binding(2) var linear_sampler: sampler;
@group(0) @binding(3) var shadow_map: texture_depth_2d;
@group(0) @binding(4) var shadow_sampler: sampler_comparison;
@group(0) @binding(5) var<uniform> shadowVPMatrix: mat4x4f;
@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(1) @binding(1) var texture: texture_2d<f32>;
@group(1) @binding(2) var normal_texture: texture_2d<f32>;
@group(2) @binding(0) var<uniform> model: mat4x4f;

const AMBIENT_STRENGTH = 0.1;
const SPECULAR_STRENGTH = 0.5;

@vertex
fn vs_main(input: VertextIn) -> VertexOut {
  var output: VertexOut;
  // 注意矩阵乘法顺序: P * V * M * pos
  let world_position = model * vec4f(input.position, 1.0);
  output.position = camera.vp_matrix * world_position;
  output.world_position = world_position.xyz;
  output.uv = input.uv;
  let N = normalize((model * vec4f(input.normal, 0.0)).xyz);
  let T = normalize((model * vec4f(input.tangent.xyz, 0.0)).xyz);
  let B = cross(N, T) * input.tangent.w;
  output.n_world = N;
  output.t_world = T;
  output.b_world = B;
  return output;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4f {
  let N = normalize(input.n_world);
  let T = normalize(input.t_world - N * dot(N, input.t_world));
  let B = cross(N, T); 
  let tbn = mat3x3f(T, B, N);

  let normal_sample = textureSample(normal_texture, linear_sampler, input.uv).rgb;
  let normal = normalize(normal_sample * 2.0 - 1.0); // 将法线从 [0,1] 转换到 [-1,1]
  let world_normal = normalize(tbn * normal); // 将切线空间的法线转换到世界空间

  let view_dir = normalize(input.world_position - camera.position);
  let base_color = textureSample(texture, linear_sampler, input.uv).rgb * material.color.rgb;
  let ambient = AMBIENT_STRENGTH * base_color;

  let light_num = arrayLength(&lights);
  var final_color = vec3f(0.0);
  for (var i = 0u; i < light_num; i++) {
    let light = lights[i];
    
    let diff = max(dot(world_normal, -light.direction), 0.0);
    let diffuse = diff * base_color;

    let half_vec = normalize(-light.direction - view_dir);
    let spec = pow(max(dot(world_normal, half_vec), 0.0), material.shininess);
    let specular = SPECULAR_STRENGTH * spec * material.spec_color;
    // 暂时只计算第一个光源的阴影
    var visibility = 1.0;
    if (i == 0u) {
      let shadow_pos = shadowVPMatrix * vec4f(input.world_position, 1.0);
      visibility = calculate_shadow(shadow_pos);
    }
    final_color += ambient + (diffuse + specular) * visibility;
  }

  return vec4f(final_color, 1.0);
}

fn calculate_shadow(shadow_pos: vec4f) -> f32 {
  let ndc = shadow_pos.xyz / shadow_pos.w;

  var uv = ndc.xy * 0.5 + 0.5; // 将 NDC 转换为纹理坐标 (0-1)
  uv.y = 1.0 - uv.y; // 翻转 Y 轴，因为纹理坐标通常是从左上角开始的
  let current_depth = ndc.z;

  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return 1.0; // 超出阴影贴图范围，认为不在阴影中
  }

  let size = textureDimensions(shadow_map);
  let texel_size = 1.0 / vec2f(size);
  var visibility = 0.0;
  let bias = 0.001; // 深度偏移，避免自阴影

  for (var x = -1; x <= 1; x++) {
    for (var y = -1; y <= 1; y++) {
      let offset = vec2f(f32(x), f32(y)) * texel_size;
      visibility += textureSampleCompareLevel(
        shadow_map, 
        shadow_sampler, 
        uv + offset, 
        current_depth
      );
    }
  }

  return visibility / 9.0; // 平均值，得到软阴影效果
}

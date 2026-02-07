struct VertextIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
}

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) world_normal: vec3f,
  @location(1) world_position: vec3f,
  @location(2) uv: vec2f,
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

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<uniform> light: CameraUniforms; // 复用 CameraUniforms 结构体
@group(0) @binding(2) var shadow_map: texture_depth_2d;
@group(0) @binding(3) var shadow_sampler: sampler_comparison;
@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(1) @binding(1) var texture: texture_2d<f32>;
@group(1) @binding(2) var m_sampler: sampler;
@group(2) @binding(0) var<uniform> model: mat4x4f;

const AMBIENT_STRENGTH = 0.1;
const SPECULAR_STRENGTH = 0.5;

@vertex
fn vs_main(input: VertextIn) -> VertexOut {
  var output: VertexOut;
  // 注意矩阵乘法顺序: P * V * M * pos
  let world_position = model * vec4f(input.position, 1.0);
  output.position = camera.vp_matrix * world_position;
  output.world_normal = (model * vec4f(input.normal, 0.0)).xyz;
  output.world_position = world_position.xyz;
  output.uv = input.uv;
  return output;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4f {
  let base_color = textureSample(texture, m_sampler, input.uv).rgb * material.color.rgb;
  let ambient = AMBIENT_STRENGTH * base_color;

  if (calculate_shadow(light.vp_matrix * vec4f(input.world_position, 1.0)) < 1.0) {
    return vec4f(ambient, 1.0); // 在阴影中只返回环境光
  }

  let light_dir = normalize(light.position - input.world_position);
  let view_dir = normalize(camera.position - input.world_position);
  let normal = input.world_normal;
  
  let diff = max(dot(normal, light_dir), 0.0);
  let diffuse = diff * base_color;

  let half_vec = normalize(light_dir + view_dir);
  let spec = pow(max(dot(normal, half_vec), 0.0), material.shininess);
  let specular = SPECULAR_STRENGTH * spec * material.spec_color;

  let final_color = ambient + diffuse + specular;
  return vec4f(final_color, 1.0);
}

fn calculate_shadow(shadow_pos: vec4f) -> f32 {
  let ndc = shadow_pos.xyz / shadow_pos.w;

  // 边界检查 (可选但推荐)
  // 如果点在光源视锥体外面，通常认为它没有阴影（或者全是阴影）
  // 提示：检查 ndc.x, ndc.y, ndc.z 是否在 [0, 1] 或 [-1, 1] 范围内

  var uv = ndc.xy * 0.5 + 0.5; // 将 NDC 转换为纹理坐标 (0-1)
  uv = vec2f(uv.x, 1.0 - uv.y); // 翻转 y 轴（如果需要）
  let current_depth = ndc.z;

  // 返回 1.0 (被照亮) 或 0.0 (在阴影中)
  return textureSampleCompare(
      shadow_map, 
      shadow_sampler, 
      uv, 
      current_depth - 0.005, // 深度偏移，避免自阴影
  );
}

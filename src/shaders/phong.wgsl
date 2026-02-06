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
@group(1) @binding(0) var<uniform> material: MaterialUniforms;
@group(1) @binding(1) var texture: texture_2d<f32>;
@group(1) @binding(2) var m_sampler: sampler;
@group(2) @binding(0) var<uniform> model: mat4x4f;

const SUN_POSITION = vec3f(1.0);
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
  let light_dir = normalize(SUN_POSITION - input.world_position);
  let view_dir = normalize(camera.position - input.world_position);
  let normal = input.world_normal;
  let tex_color = textureSample(texture, m_sampler, input.uv).rgb;

  let ambient = AMBIENT_STRENGTH * tex_color;
  
  let diff = max(dot(normal, light_dir), 0.0);
  let diffuse = diff * tex_color;

  let half_vec = normalize(light_dir + view_dir);
  let spec = pow(max(dot(normal, half_vec), 0.0), material.shininess);
  let specular = SPECULAR_STRENGTH * spec * material.spec_color;

  let final_color = ambient + diffuse + specular;
  return vec4f(final_color, 1.0);
}

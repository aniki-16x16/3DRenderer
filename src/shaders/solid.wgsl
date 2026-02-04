struct VertextIn {
  @builtin(vertex_index) vertex_index: u32,
  @location(0) position: vec3f,
}

struct VertexOut {
  @builtin(position) position: vec4f,
}

@group(0) @binding(0) var<uniform> camera: mat4x4f;
@group(1) @binding(0) var<uniform> materialColor: vec4f;
@group(2) @binding(0) var<uniform> model: mat4x4f;

@vertex
fn vs_main(input: VertextIn) -> VertexOut {
  var output: VertexOut;
  // 注意矩阵乘法顺序: P * V * M * pos
  output.position = camera * model * vec4f(input.position, 1.0);
  return output;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4f {
  return materialColor;
}

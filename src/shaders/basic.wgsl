struct VertextIn {
  @builtin(vertex_index) vertex_index: u32,
  @location(0) position: vec3f,
}

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
}

@group(0) @binding(0) var<uniform> camera: mat4x4f;
// Group 1: Material (Reserved)
@group(2) @binding(0) var<uniform> model: mat4x4f;

@vertex
fn vs_main(input: VertextIn) -> VertexOut {
  var output: VertexOut;
  // 注意矩阵乘法顺序: P * V * M * pos
  output.position = camera * model * vec4f(input.position, 1.0);
  
  switch (input.vertex_index % 3u) {
    case 0u: {
      output.color = vec3f(1.0, 0.0, 0.0); // Red
    }
    case 1u: {
      output.color = vec3f(0.0, 1.0, 0.0); // Green
    }
    case 2u: {
      output.color = vec3f(0.0, 0.0, 1.0); // Blue
    }
    default: {
      output.color = vec3f(1.0, 1.0, 1.0); // White
    }
  }
  return output;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4f {
  return vec4f(input.color, 1.0);
}

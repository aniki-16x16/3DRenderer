@group(0) @binding(0) var hdr_color: texture_2d<f32>;
@group(0) @binding(1) var<uniform> exposure: f32;

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let points = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  return vec4f(points[index], 0, 1);
}

@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let raw_color = textureLoad(hdr_color, vec2i(position.xy), 0);
  return vec4f(color2sRGB(tone_mapping(raw_color.rgb * exposure)), 1);
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

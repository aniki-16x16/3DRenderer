import { StructLayout } from "../foundation/StructLayout";

// CPU/WGSL 协议集中在此。增加字段时同时更新对应 WGSL 声明。
export const cameraLayout = new StructLayout({ vp_matrix: "mat4x4f", position: "vec3f", light_count: "u32" });
export const modelLayout = new StructLayout({ matrix: "mat4x4f" });
export const lightLayout = new StructLayout({
  position: "vec3f", light_type: "u32", color: "vec3f", intensity: "f32",
  direction: "vec3f", range: "f32",
});
export const pbrLayout = new StructLayout({ base_color: "vec4f", metallic: "f32", roughness: "f32", padding: "vec2f" });
export const phongLayout = new StructLayout({ color: "vec4f", spec_color: "vec3f", shininess: "f32" });
export const solidColorLayout = new StructLayout({ color: "vec4f" });

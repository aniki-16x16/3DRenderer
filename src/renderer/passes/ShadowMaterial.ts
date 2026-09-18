import { Material } from "../../materials/Material";
import shaderSource from "./shadow.wgsl?raw";

export class ShadowMaterial extends Material {
  override readonly shaderSource = shaderSource;
  protected materialKind: string = "Shadow";
  protected enableFragment: boolean = false;

  constructor(label?: string) {
    super(label ?? "ShadowMaterial");
  }

  protected getDepthStencilConfig(): GPUDepthStencilState {
    return {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth32float",
      depthBias: 0.0002, // 深度偏移，避免自阴影
      depthBiasSlopeScale: 5,
      depthBiasClamp: 0.1,
    };
  }
}

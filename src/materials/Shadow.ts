import { Material } from "../graphics/Material";

export class ShadowMaterial extends Material {
  protected _TAG: string = "Shadow";
  protected _enableFragment: boolean = false;

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

export const shadowMaterial = new ShadowMaterial();

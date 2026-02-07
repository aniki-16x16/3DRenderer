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
    };
  }
}

export const shadowMaterial = new ShadowMaterial();

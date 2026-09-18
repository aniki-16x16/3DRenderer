import { ResourceScope } from "../utils/ResourceScope";

export const HDR_FORMAT: GPUTextureFormat = "rgba16float";

/** 随画布尺寸变化的附件；阴影贴图由 ShadowPass 单独持有。 */
export class FrameTargets {
  private scope = new ResourceScope();
  private attachments?: {
    width: number;
    height: number;
    color: GPUTextureView;
    depth: GPUTextureView;
  };
  private readonly device: GPUDevice;

  constructor(device: GPUDevice) {
    this.device = device;
  }

  get colorView(): GPUTextureView {
    if (!this.attachments) throw new Error("Resize frame targets before use");
    return this.attachments.color;
  }

  get depthView(): GPUTextureView {
    if (!this.attachments) throw new Error("Resize frame targets before use");
    return this.attachments.depth;
  }

  /** 尺寸不变时复用；分配失败时保留原附件。 */
  resize(width: number, height: number): void {
    if (this.scope.destroyed) throw new Error("FrameTargets has been destroyed");
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    if (this.attachments?.width === width && this.attachments.height === height) return;
    const next = new ResourceScope();
    let attachments: NonNullable<FrameTargets["attachments"]>;
    try {
      const depth = next.own(
        this.device.createTexture({
          label: "FrameTargets-DepthTexture",
          size: [width, height],
          format: "depth24plus",
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
        }),
      );
      const color = next.own(
        this.device.createTexture({
          label: "FrameTargets-HdrTexture",
          size: [width, height],
          format: HDR_FORMAT,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        }),
      );
      attachments = { width, height, depth: depth.createView(), color: color.createView() };
    } catch (error) {
      next.destroy();
      throw error;
    }
    const previous = this.scope;
    this.scope = next;
    this.attachments = attachments;
    previous.destroy();
  }

  destroy(): void {
    this.attachments = undefined;
    this.scope.destroy();
  }
}

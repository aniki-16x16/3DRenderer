import { ResourceScope } from "../foundation/ResourceScope";

/** 一次 GPU 分配；通过 TextureResources 创建并管理，使用者只借用。 */
export class Texture {
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
  private disposed = false;

  readonly device: GPUDevice;

  static createOwned(scope: ResourceScope, device: GPUDevice, descriptor: GPUTextureDescriptor) {
    if (scope.destroyed) throw new Error("Texture owner has been destroyed");
    return scope.own(new Texture(device, descriptor));
  }

  private constructor(device: GPUDevice, descriptor: GPUTextureDescriptor) {
    this.device = device;
    this.texture = device.createTexture(descriptor);
    try {
      this.view = this.texture.createView();
    } catch (error) {
      this.texture.destroy();
      throw error;
    }
  }

  get destroyed() {
    return this.disposed;
  }
  get width() {
    return this.texture.width;
  }
  get height() {
    return this.texture.height;
  }
  get format() {
    return this.texture.format;
  }

  assertUsable(device: GPUDevice) {
    if (this.disposed) throw new Error("Texture has been destroyed");
    if (this.device !== device) throw new Error("Texture belongs to another GPUDevice");
  }

  createView(descriptor?: GPUTextureViewDescriptor) {
    this.assertUsable(this.device);
    return this.texture.createView(descriptor);
  }

  /** 由所有者调用；销毁后不可重新初始化。 */
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    this.texture.destroy();
  }
}

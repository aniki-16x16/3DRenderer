import { ResourceScope } from "../foundation/ResourceScope";
import { loadImage } from "../loader/ImageLoader";
import { Texture } from "./Texture";

export interface ImageTextureOptions {
  label?: string;
  colorSpace?: "linear" | "srgb";
}

/** 一个 Device 下的资产所有者；与场景的引用关系无关。 */
export class TextureResources {
  private readonly scope = new ResourceScope();
  private readonly pending = new Set<AbortController>();
  private whiteTexture?: Texture;
  private blackTexture?: Texture;
  private normalTexture?: Texture;

  readonly device: GPUDevice;

  constructor(device: GPUDevice) {
    this.device = device;
  }

  private assertOpen() {
    if (this.scope.destroyed) throw new Error("TextureResources has been destroyed");
  }

  /** 原始分配入口，也可供外部解码器上传浮点像素。 */
  create(descriptor: GPUTextureDescriptor): Texture {
    this.assertOpen();
    return Texture.createOwned(this.scope, this.device, descriptor);
  }

  /** 借用 CPU 图片上传；不会关闭调用者提供的图片。 */
  fromImage(image: ImageBitmap, options: ImageTextureOptions = {}): Texture {
    const texture = this.create({
      label: options.label ?? "ImageTexture",
      size: [image.width, image.height],
      format: options.colorSpace === "srgb" ? "rgba8unorm-srgb" : "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    try {
      this.device.queue.copyExternalImageToTexture(
        { source: image },
        { texture: texture.texture },
        [image.width, image.height],
      );
      return texture;
    } catch (error) {
      this.scope.release(texture);
      throw error;
    }
  }

  /** 完整成功后才返回新资源；销毁作用域会取消在途请求。 */
  async loadImage(
    url: string,
    options: ImageTextureOptions = {},
    signal?: AbortSignal,
  ): Promise<Texture> {
    this.assertOpen();
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    this.pending.add(controller);
    try {
      const image = await loadImage(url, controller.signal);
      try {
        controller.signal.throwIfAborted();
        this.assertOpen();
        return this.fromImage(image, { ...options, label: options.label ?? url });
      } finally {
        image.close();
      }
    } finally {
      signal?.removeEventListener("abort", abort);
      this.pending.delete(controller);
    }
  }

  createSolid(color: [number, number, number, number], options: ImageTextureOptions = {}): Texture {
    const texture = this.create({
      label: options.label ?? "SolidTexture",
      size: [1, 1],
      format: options.colorSpace === "srgb" ? "rgba8unorm-srgb" : "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    try {
      this.device.queue.writeTexture(
        { texture: texture.texture },
        new Uint8Array(color),
        { bytesPerRow: 4 },
        [1, 1],
      );
      return texture;
    } catch (error) {
      this.scope.release(texture);
      throw error;
    }
  }

  get white(): Texture {
    this.assertOpen();
    return (this.whiteTexture ??= this.createSolid([255, 255, 255, 255], {
      label: "white",
      colorSpace: "srgb",
    }));
  }

  get black(): Texture {
    this.assertOpen();
    return (this.blackTexture ??= this.createSolid([0, 0, 0, 255], {
      label: "black",
      colorSpace: "srgb",
    }));
  }

  get normal(): Texture {
    this.assertOpen();
    return (this.normalTexture ??= this.createSolid([128, 128, 255, 255], { label: "normal" }));
  }

  /** 调用者必须先移除所有使用引用、刷新绑定。默认纹理随集合释放。 */
  release(texture: Texture) {
    if (texture === this.whiteTexture || texture === this.blackTexture || texture === this.normalTexture)
      throw new Error("Default textures are released with TextureResources");
    this.scope.release(texture);
  }

  destroy() {
    try {
      this.scope.destroy();
    } finally {
      for (const controller of this.pending) controller.abort();
      this.pending.clear();
    }
  }
}

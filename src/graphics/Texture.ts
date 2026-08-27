export type TextureColorSpace = "linear" | "srgb";
export type ImageTextureFormat = "rgba8unorm" | "rgba8unorm-srgb";

export interface TextureOptions {
  colorSpace?: TextureColorSpace;
  format?: ImageTextureFormat;
}

export class Texture {
  texture: GPUTexture | null = null;
  view: GPUTextureView | null = null;

  label: string;
  readonly colorSpace: TextureColorSpace;
  readonly format: ImageTextureFormat;

  constructor(label: string = "Texture", options: TextureOptions = {}) {
    this.label = label;
    this.format =
      options.format ??
      (options.colorSpace === "srgb" ? "rgba8unorm-srgb" : "rgba8unorm");
    const formatColorSpace = this.format.endsWith("-srgb") ? "srgb" : "linear";
    if (options.colorSpace && options.colorSpace !== formatColorSpace) {
      throw new Error(
        `Texture format ${this.format} conflicts with ${options.colorSpace} color space.`,
      );
    }
    this.colorSpace = formatColorSpace;
  }

  initialize(
    device: GPUDevice,
    color: [number, number, number, number] = [255, 0, 255, 255],
  ) {
    this.destroy();
    this.texture = device.createTexture({
      label: this.label,
      size: [1, 1], // 初始大小为 1x1，稍后会更新
      format: this.format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: this.texture },
      new Uint8Array(color), // 默认填充为纯品红色，表示纹理未加载
      { bytesPerRow: 4 },
      [1, 1],
    );
    this.view = this.texture.createView();
  }

  /**
   * 异步加载纹理资源到 GPU
   */
  async load(device: GPUDevice, url: string) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load texture: ${url} (${response.status})`);
    }
    const blob = await response.blob();
    // 使用 createImageBitmap 是 WebGPU 推荐的方式，它比 Image 元素更高效
    const source = await createImageBitmap(blob);

    this.destroy();
    try {
      this.texture = device.createTexture({
        label: this.label,
        size: [source.width, source.height],
        format: this.format,
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      device.queue.copyExternalImageToTexture(
        { source },
        { texture: this.texture },
        [source.width, source.height],
      );
    } finally {
      source.close();
    }

    this.view = this.texture.createView();
  }

  destroy() {
    this.texture?.destroy();
    this.texture = null;
    this.view = null;
  }
}

export let linearSampler: GPUSampler | null = null;
export let comparisonSampler: GPUSampler | null = null;

export function initializeSamplers(device: GPUDevice) {
  linearSampler = device.createSampler({
    label: "LinearSampler",
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "repeat",
    addressModeV: "repeat",
  });
  comparisonSampler = device.createSampler({
    label: "ComparisonSampler",
    compare: "less",
    minFilter: "linear",
    magFilter: "linear",
    addressModeU: "repeat",
    addressModeV: "repeat",
  });
}

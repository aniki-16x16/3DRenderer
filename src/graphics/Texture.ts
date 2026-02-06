export class Texture {
  texture: GPUTexture | null = null;
  view: GPUTextureView | null = null;
  sampler: GPUSampler | null = null;

  label: string;

  constructor(label: string = "Texture") {
    this.label = label;
  }

  initialize(
    device: GPUDevice,
    color: [number, number, number, number] = [255, 0, 255, 255],
  ) {
    // 预先创建一个空的 GPUTexture，稍后会用实际图片数据替换它
    this.texture = device.createTexture({
      label: this.label,
      size: [1, 1], // 初始大小为 1x1，稍后会更新
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: this.texture },
      new Uint8Array(color), // 默认填充为纯品红色，表示纹理未加载
      { bytesPerRow: 4 },
      [1, 1],
    );
    this.sampler = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "repeat",
      addressModeV: "repeat",
    });
    this.view = this.texture.createView();
  }

  /**
   * 异步加载纹理资源到 GPU
   */
  async load(device: GPUDevice, url: string) {
    const response = await fetch(url);
    const blob = await response.blob();
    // 使用 createImageBitmap 是 WebGPU 推荐的方式，它比 Image 元素更高效
    const source = await createImageBitmap(blob);

    this.texture = device.createTexture({
      label: this.label,
      size: [source.width, source.height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture(
      { source }, // 图片数据来源
      { texture: this.texture }, // 目标 GPUTexture
      [source.width, source.height], // 复制区域大小
    );

    this.sampler = device.createSampler({
      magFilter: "linear", // 放大时：线性插值 (平滑)
      minFilter: "linear", // 缩小时：线性插值
      addressModeU: "repeat", // UV 超出 0-1 时重复
      addressModeV: "repeat",
    });
    this.view = this.texture.createView();
  }
}

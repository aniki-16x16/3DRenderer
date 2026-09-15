/** 可复用的 CPU 暂存区；只在字节变化或目标 Buffer 更换时上传。 */
export class UniformSync {
  readonly data: ArrayBuffer;
  private readonly bytes: Uint8Array;
  private readonly uploaded: Uint8Array;
  private target: GPUBuffer | null = null;

  constructor(byteSize: number) {
    this.data = new ArrayBuffer(byteSize);
    this.bytes = new Uint8Array(this.data);
    this.uploaded = new Uint8Array(byteSize);
  }

  upload(device: GPUDevice, buffer: GPUBuffer) {
    if (this.target === buffer && this.bytes.every((value, i) => value === this.uploaded[i]))
      return;
    device.queue.writeBuffer(buffer, 0, this.data);
    this.uploaded.set(this.bytes);
    this.target = buffer;
  }

  reset() {
    this.target = null;
  }
}

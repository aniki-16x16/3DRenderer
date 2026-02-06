/**
 * 网格类
 * 负责管理几何体数据（顶点、索引等）及其在 GPU 上的缓冲资源
 */
export class Mesh {
  vertexData: Float32Array;
  indexData: Uint16Array | Uint32Array | null;
  normalData: Float32Array | null = null;
  uvData: Float32Array | null = null;

  vertexBuffer: GPUBuffer | null = null;
  indexBuffer: GPUBuffer | null = null;
  normalBuffer: GPUBuffer | null = null;
  uvBuffer: GPUBuffer | null = null;

  vertexCount: number = 0;
  indexCount: number = 0;

  /**
   * @param vertices 顶点数据 (默认布局: position(3) + normal(3) + uv(2))，也可以只是 position(3)
   * @param indices 索引数据 (可选)
   */
  constructor(
    vertices: number[] | Float32Array,
    indices?: number[] | Uint16Array | Uint32Array,
    normals?: number[] | Float32Array,
    uvs?: number[] | Float32Array,
  ) {
    this.vertexData =
      vertices instanceof Float32Array ? vertices : new Float32Array(vertices);

    if (indices) {
      if (indices instanceof Uint16Array || indices instanceof Uint32Array) {
        this.indexData = indices;
      } else {
        // 如果索引超过 65535，使用 Uint32
        this.indexData =
          indices.length > 65535
            ? new Uint32Array(indices)
            : new Uint16Array(indices);
      }
      this.indexCount = indices.length;
    } else {
      this.indexData = null;
      this.indexCount = 0;
    }

    if (normals) {
      this.normalData =
        normals instanceof Float32Array ? normals : new Float32Array(normals);
    }

    if (uvs) {
      this.uvData = uvs instanceof Float32Array ? uvs : new Float32Array(uvs);
    }

    // 假设每个顶点只有 position(3)，后续如果引入标准材质需要改为 STRIDE 计算
    // 暂时简单处理：如果不传索引，则顶点数 = 数据长度 / 3 (假设只有 position)
    // 这是一个临时假设，稍后我们定义 VertexLayout 时会加强这里
    this.vertexCount = this.vertexData.length / 3;
  }

  /**
   * 创建 GPU 资源
   * @param device WebGPU 设备
   */
  initialize(device: GPUDevice) {
    // 创建顶点缓冲
    this.vertexBuffer = device.createBuffer({
      size: this.vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(this.vertexData);
    this.vertexBuffer.unmap();

    // 创建索引缓冲 (如果有)
    if (this.indexData) {
      this.indexBuffer = device.createBuffer({
        size: this.indexData.byteLength,
        // 需要补齐 4 字节对齐吗？WebGPU 对 buffer size 通常要求 4 字节倍数
        // 你的数据如果是 Uint16 且长度为奇数，byteLength 是偶数但可能不是 4 的倍数
        // 为了安全，向上取整到 4 的倍数
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });

      // 注意：如果 indices 是 Uint16Array，这里就要用 Uint16Array view
      // 如果为了对其可能有 padding，只需要把数据拷进前部即可
      if (this.indexData instanceof Uint16Array) {
        new Uint16Array(this.indexBuffer.getMappedRange()).set(this.indexData);
      } else {
        new Uint32Array(this.indexBuffer.getMappedRange()).set(this.indexData);
      }
      this.indexBuffer.unmap();
    }

    if (this.normalData) {
      this.normalBuffer = device.createBuffer({
        size: this.normalData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });
      new Float32Array(this.normalBuffer.getMappedRange()).set(this.normalData);
      this.normalBuffer.unmap();
    }

    if (this.uvData) {
      this.uvBuffer = device.createBuffer({
        size: this.uvData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });
      new Float32Array(this.uvBuffer.getMappedRange()).set(this.uvData);
      this.uvBuffer.unmap();
    }
  }

  /**
   * 释放 GPU 资源
   */
  destroy() {
    if (this.vertexBuffer) this.vertexBuffer.destroy();
    if (this.indexBuffer) this.indexBuffer.destroy();
    if (this.normalBuffer) this.normalBuffer.destroy();
    if (this.uvBuffer) this.uvBuffer.destroy();
  }
}

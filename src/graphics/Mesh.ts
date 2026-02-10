/**
 * 网格类
 * 负责管理几何体数据（顶点、索引等）及其在 GPU 上的缓冲资源
 */
export class Mesh {
  vertexData: Float32Array;
  indexData: Uint16Array | Uint32Array | null;
  normalData: Float32Array | null = null;
  uvData: Float32Array | null = null;
  tangentData: Float32Array | null = null;

  vertexBuffer: GPUBuffer | null = null;
  indexBuffer: GPUBuffer | null = null;
  normalBuffer: GPUBuffer | null = null;
  uvBuffer: GPUBuffer | null = null;
  tangentBuffer: GPUBuffer | null = null;

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

    if (this.normalData && this.uvData && this.indexData) {
      this.tangentData = calculateTangents(
        this.vertexData,
        this.normalData,
        this.uvData,
        this.indexData,
      );
    }

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

    if (this.tangentData) {
      this.tangentBuffer = device.createBuffer({
        size: this.tangentData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });
      new Float32Array(this.tangentBuffer.getMappedRange()).set(
        this.tangentData,
      );
      this.tangentBuffer.unmap();
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
    if (this.tangentBuffer) this.tangentBuffer.destroy();
  }
}

/**
 * 计算切线数据
 * 需要位置、法线、UV 和索引数据
 */
export function calculateTangents(
  positions: Float32Array,
  normals: Float32Array,
  uvs: Float32Array,
  indices: Uint16Array | Uint32Array | number[],
): Float32Array {
  const tangents = new Float32Array((positions.length / 3) * 4); // vec4: x,y,z,w (w用于处理镜像)

  // 临时累加数组
  const tan1 = new Float32Array(positions.length);

  // 1. 遍历每个三角形
  for (let i = 0; i < indices.length; i += 3) {
    const i1 = indices[i];
    const i2 = indices[i + 1];
    const i3 = indices[i + 2];

    const x1 = positions[i1 * 3],
      y1 = positions[i1 * 3 + 1],
      z1 = positions[i1 * 3 + 2];
    const x2 = positions[i2 * 3],
      y2 = positions[i2 * 3 + 1],
      z2 = positions[i2 * 3 + 2];
    const x3 = positions[i3 * 3],
      y3 = positions[i3 * 3 + 1],
      z3 = positions[i3 * 3 + 2];

    const u1 = uvs[i1 * 2],
      v1 = uvs[i1 * 2 + 1];
    const u2 = uvs[i2 * 2],
      v2 = uvs[i2 * 2 + 1];
    const u3 = uvs[i3 * 2],
      v3 = uvs[i3 * 2 + 1];

    // 2. 计算边的向量 (Delta Position 和 Delta UV)
    const x10 = x2 - x1,
      y10 = y2 - y1,
      z10 = z2 - z1;
    const x20 = x3 - x1,
      y20 = y3 - y1,
      z20 = z3 - z1;

    const u10 = u2 - u1,
      v10 = v2 - v1;
    const u20 = u3 - u1,
      v20 = v3 - v1;

    // 3. 解方程求切线
    // 这是一个线性方程组，求逆矩阵系数 r
    const det = u10 * v20 - u20 * v10;
    const r = det === 0 ? 0 : 1.0 / det;

    const tx = (v20 * x10 - v10 * x20) * r;
    const ty = (v20 * y10 - v10 * y20) * r;
    const tz = (v20 * z10 - v10 * z20) * r;

    // 累加到三角形的三个顶点上（平滑处理）
    tan1[i1 * 3] += tx;
    tan1[i1 * 3 + 1] += ty;
    tan1[i1 * 3 + 2] += tz;
    tan1[i2 * 3] += tx;
    tan1[i2 * 3 + 1] += ty;
    tan1[i2 * 3 + 2] += tz;
    tan1[i3 * 3] += tx;
    tan1[i3 * 3 + 1] += ty;
    tan1[i3 * 3 + 2] += tz;
  }

  // 4. 正交化并写入结果
  for (let i = 0; i < positions.length / 3; i++) {
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];

    const tx = tan1[i * 3];
    const ty = tan1[i * 3 + 1];
    const tz = tan1[i * 3 + 2];

    // Gram-Schmidt 正交化: t' = normalize(t - n * dot(n, t));
    // 确保切线垂直于法线
    const ndott = nx * tx + ny * ty + nz * tz;
    let rx = tx - nx * ndott;
    let ry = ty - ny * ndott;
    let rz = tz - nz * ndott;

    const len = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (len > 0) {
      rx /= len;
      ry /= len;
      rz /= len;
    }

    // 5. 计算 W 分量 (Handedness)
    // 用于处理镜像UV，判断 TBN 是否需要翻转
    // w = (cross(n, t) dot t2) < 0 ? -1 : 1
    // 这里为了简单暂时设为 1.0，复杂模型可能需要计算
    const w = 1.0;

    tangents[i * 4] = rx;
    tangents[i * 4 + 1] = ry;
    tangents[i * 4 + 2] = rz;
    tangents[i * 4 + 3] = w;
  }

  return tangents;
}

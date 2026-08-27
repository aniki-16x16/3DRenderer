/**
 * 标准 Mesh 的 GPU 顶点输入协议。
 * Mesh、Material 与 WGSL 必须共同遵守这些 slot/location 约定。
 */
export const StandardVertexBufferSlot = {
  Position: 0,
  Normal: 1,
  UV: 2,
  Tangent: 3,
} as const;

export const positionOnlyVertexBufferLayouts: GPUVertexBufferLayout[] = [
  {
    arrayStride: 3 * 4,
    attributes: [
      {
        shaderLocation: 0,
        offset: 0,
        format: "float32x3",
      },
    ],
  },
];

export const standardVertexBufferLayouts: GPUVertexBufferLayout[] = [
  ...positionOnlyVertexBufferLayouts,
  {
    arrayStride: 3 * 4,
    attributes: [
      {
        shaderLocation: 1,
        offset: 0,
        format: "float32x3",
      },
    ],
  },
  {
    arrayStride: 2 * 4,
    attributes: [
      {
        shaderLocation: 2,
        offset: 0,
        format: "float32x2",
      },
    ],
  },
  {
    arrayStride: 4 * 4,
    attributes: [
      {
        shaderLocation: 3,
        offset: 0,
        format: "float32x4",
      },
    ],
  },
];

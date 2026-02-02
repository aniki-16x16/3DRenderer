import { Shader } from "./Shader";

/**
 * 材质/管线配置类
 * 封装 GPURenderPipeline 的创建逻辑
 */
export class Material {
  pipeline: GPURenderPipeline | null = null;
  label: string;

  // 渲染状态配置 (可以根据需要扩展更多配置)
  cullMode: GPUCullMode = "back";
  topology: GPUPrimitiveTopology = "triangle-list";

  constructor(label: string) {
    this.label = label;
  }

  /**
   * 初始化管线
   * 注意：这里暂时硬编码了 vertexBuffers layout，后续需要根据 Mesh 或者 VertexLayout 类动态生成
   */
  initialize(
    device: GPUDevice,
    format: GPUTextureFormat,
    shader: Shader,
    pipelineLayout: GPUPipelineLayout,
  ) {
    this.pipeline = device.createRenderPipeline({
      label: this.label,
      layout: pipelineLayout,
      vertex: {
        module: shader.module,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: 3 * 4, // vec3<f32> * 4 bytes
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3",
              },
            ],
          },
        ],
      },
      fragment: {
        module: shader.module,
        entryPoint: "fs_main",
        targets: [
          {
            format: format,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: this.topology,
        cullMode: this.cullMode,
      },
    });
  }
}

import { globalResourceCache } from "../core/ResourceCache";
import { Shader } from "./Shader";

/**
 * 材质基类
 * 负责管理 Pipeline Layout 和 BindGroup
 *
 * 架构约定：
 * Group 0: Frame Level (Camera) - 由 Renderer 提供 Layout
 * Group 1: Material Level (Material) - 由 Material 自己定义和提供 Layout & BindGroup
 * Group 2: Model Level (Model) - 由 Renderer 提供 Layout
 */
export class Material {
  static _idCounter = 1;
  static generateId() {
    return Material._idCounter++;
  }

  protected _TAG = "Base";
  get TAG() {
    return this._TAG;
  }

  private _ID: number = 0;
  get ID() {
    return this._ID;
  }

  pipeline: GPURenderPipeline | null = null;
  label: string;

  // Group 1 的资源
  bindGroupLayout: GPUBindGroupLayout | null = null;
  bindGroup: GPUBindGroup | null = null;

  cullMode: GPUCullMode = "back";
  topology: GPUPrimitiveTopology = "triangle-list";

  constructor(label = "") {
    this.label = label;
    this._ID = Material.generateId();
  }

  /**
   * 初始化
   * @param device
   * @param format
   * @param shader
   * @param frameLayout Group 0 Layout (Camera)
   * @param modelLayout Group 2 Layout (Model)
   */
  initialize(
    device: GPUDevice,
    format: GPUTextureFormat,
    shader: Shader,
    frameLayout: GPUBindGroupLayout,
    modelLayout: GPUBindGroupLayout,
  ) {
    // 1. 创建 Material 自己的 Layout (Group 1)
    // 默认空 Layout (如果子类不重写，表示该材质无需 Uniform)
    if (!this.bindGroupLayout) {
      const cachedBindLayout = globalResourceCache.getBindGroupLayout(
        this._TAG,
      );
      if (cachedBindLayout) {
        this.bindGroupLayout = cachedBindLayout;
      } else {
        this.bindGroupLayout = device.createBindGroupLayout({
          label: `${this.label}-empty-layout`,
          entries: [], // 空
        });
        globalResourceCache.setBindGroupLayout(this._TAG, this.bindGroupLayout);
      }
    }

    // 2. 创建 PipelineLayout (0: Frame, 1: Material, 2: Model)
    const cachedPipelineLayout = globalResourceCache.getPipelineLayout(
      this._TAG,
    );
    const pipelineLayout =
      cachedPipelineLayout ??
      device.createPipelineLayout({
        label: `${this.label}-pipeline-layout`,
        bindGroupLayouts: [frameLayout, this.bindGroupLayout, modelLayout],
      });
    if (!cachedPipelineLayout) {
      globalResourceCache.setPipelineLayout(this._TAG, pipelineLayout);
    }

    // 3. 创建 Pipeline
    const cachedPipeline = globalResourceCache.getRenderPipeline(this._TAG);
    if (cachedPipeline) {
      this.pipeline = cachedPipeline;
    } else {
      this.pipeline = device.createRenderPipeline({
        label: this.label,
        layout: pipelineLayout,
        vertex: {
          module: shader.module,
          entryPoint: "vs_main",
          buffers: this.getVertextBufferLayouts(),
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
        depthStencil: {
          depthWriteEnabled: true,
          depthCompare: "less",
          format: "depth24plus",
        },
      });
      globalResourceCache.setRenderPipeline(this._TAG, this.pipeline);
    }

    // 4. 创建默认的 BindGroup (Group 1)
    // 子类可以在这里做更多事情，比如创建 Buffer
    this.createBindGroup(device);
  }

  protected createBindGroup(device: GPUDevice) {
    if (!this.bindGroupLayout) return;

    this.bindGroup = device.createBindGroup({
      label: `${this.label}-bind-group`,
      layout: this.bindGroupLayout,
      entries: [], // 空 entries 对应上面的空 layout
    });
  }

  protected getVertextBufferLayouts(): GPUVertexBufferLayout[] {
    return [
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
  }
}

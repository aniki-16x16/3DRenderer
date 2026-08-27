import { getResourceCache } from "../core/ResourceCache";
import { Shader } from "./Shader";
import { StandardLayouts } from "./StandardLayouts";
import { positionOnlyVertexBufferLayouts } from "./StandardVertexLayout";

/**
 * 材质基类
 * 负责管理 Pipeline Layout 和 BindGroup
 *
 * 架构约定：
 * Group 0: Scene / Frame Level - 由 Renderer 提供 Layout
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

  protected _enableFragment = true;

  pipeline: GPURenderPipeline | null = null;
  label: string;

  // Layout/Pipeline 可在同一 Device 内共享，BindGroup 则属于材质实例。
  bindGroupLayout: GPUBindGroupLayout | null = null;
  bindGroup: GPUBindGroup | null = null;

  cullMode: GPUCullMode = "back";
  topology: GPUPrimitiveTopology = "triangle-list";

  constructor(label = "Material") {
    this.label = label;
    this._ID = Material.generateId();
  }

  /**
   * 初始化
   * @param device
   * @param format
   * @param shader
   * @param sceneLayout Group 0 Layout (Camera / Lights / Pass resources)
   * @param modelLayout Group 2 Layout (Model)
   */
  initialize(
    device: GPUDevice,
    format: GPUTextureFormat,
    shader: Shader,
    sceneLayout: GPUBindGroupLayout = StandardLayouts.sceneBindGroupLayout,
    modelLayout: GPUBindGroupLayout = StandardLayouts.modelBindGroupLayout,
  ) {
    const resourceCache = getResourceCache(device);

    // 1. 创建 Material 自己的 Layout (Group 1)
    // 默认空 Layout (如果子类不重写，表示该材质无需 Uniform)
    if (!this.bindGroupLayout) {
      const materialLayoutKey = `material-layout:${this._TAG}`;
      const cachedBindLayout = resourceCache.getBindGroupLayout(
        materialLayoutKey,
      );
      if (cachedBindLayout) {
        this.bindGroupLayout = cachedBindLayout;
      } else {
        this.bindGroupLayout = device.createBindGroupLayout({
          label: `${this.label}-empty-layout`,
          entries: [], // 空
        });
        resourceCache.setBindGroupLayout(
          materialLayoutKey,
          this.bindGroupLayout,
        );
      }
    }

    // 2. 创建 PipelineLayout (0: Frame, 1: Material, 2: Model)
    const pipelineLayoutKey = [
      "pipeline-layout",
      resourceCache.getResourceId(sceneLayout),
      resourceCache.getResourceId(this.bindGroupLayout),
      resourceCache.getResourceId(modelLayout),
    ].join(":");
    const cachedPipelineLayout =
      resourceCache.getPipelineLayout(pipelineLayoutKey);
    const pipelineLayout =
      cachedPipelineLayout ??
      device.createPipelineLayout({
        label: `${this.label}-pipeline-layout`,
        bindGroupLayouts: [sceneLayout, this.bindGroupLayout, modelLayout],
      });
    if (!cachedPipelineLayout) {
      resourceCache.setPipelineLayout(pipelineLayoutKey, pipelineLayout);
    }

    // 3. 创建 Pipeline
    const vertexBufferLayouts = this.getVertexBufferLayouts();
    const depthStencil = this.getDepthStencilConfig();
    const pipelineKey = JSON.stringify({
      tag: this._TAG,
      shaderId: shader.ID,
      format,
      pipelineLayout: resourceCache.getResourceId(pipelineLayout),
      enableFragment: this._enableFragment,
      topology: this.topology,
      cullMode: this.cullMode,
      vertexBufferLayouts,
      depthStencil,
    });
    const cachedPipeline = resourceCache.getRenderPipeline(pipelineKey);
    if (cachedPipeline) {
      this.pipeline = cachedPipeline;
    } else {
      this.pipeline = device.createRenderPipeline({
        label: this.label,
        layout: pipelineLayout,
        vertex: {
          module: shader.module,
          entryPoint: "vs_main",
          buffers: vertexBufferLayouts,
        },
        ...(this._enableFragment
          ? {
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
            }
          : {}),
        primitive: {
          topology: this.topology,
          cullMode: this.cullMode,
        },
        depthStencil,
      });
      resourceCache.setRenderPipeline(pipelineKey, this.pipeline);
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

  protected getVertexBufferLayouts(): GPUVertexBufferLayout[] {
    return positionOnlyVertexBufferLayouts;
  }

  destroy() {
    this.bindGroup = null;
    this.bindGroupLayout = null;
    this.pipeline = null;
  }

  protected getDepthStencilConfig(): GPUDepthStencilState {
    return {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth24plus",
    };
  }
}

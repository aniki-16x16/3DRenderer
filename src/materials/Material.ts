import { resourceLabel } from "../gpu/ResourceLabels";
import type { TextureResources } from "../assets/TextureResources";
import { getPipelineCache, pipelineKeys } from "../gpu/PipelineCache";
import { Shader } from "../gpu/Shader";
import { BindGroupLayouts } from "../renderer/layouts/BindGroupLayouts";
import { positionOnlyVertexBufferLayouts } from "../renderer/layouts/VertexLayouts";

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
  private static nextId = 1;
  readonly id = Material.nextId++;
  /** 默认源码由具体材质声明；也可在首次绘制前由 SceneResources 覆盖。 */
  readonly shaderSource: string | undefined = undefined;

  protected materialKind = "Base";
  get kind() {
    return this.materialKind;
  }

  protected enableFragment = true;

  pipeline: GPURenderPipeline | null = null;
  label: string;

  // Layout/Pipeline 可在同一 Device 内共享，BindGroup 则属于材质实例。
  bindGroupLayout: GPUBindGroupLayout | null = null;
  bindGroup: GPUBindGroup | null = null;

  cullMode: GPUCullMode = "back";
  topology: GPUPrimitiveTopology = "triangle-list";

  protected resourceLabel(role: string): string {
    return resourceLabel(this.label, role);
  }

  constructor(label = "Material") {
    this.label = label;
  }

  /** 渲染前解析借用资源；子类可在引用变化时刷新绑定，不接管资源所有权。 */
  prepareResources(_device: GPUDevice, _textures: TextureResources): void {}

  /** 初始化后、绘制前同步当前参数；调用者不需要标记 needsUpdate。 */
  syncUniforms(_device: GPUDevice): void {}

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
    sceneLayout: GPUBindGroupLayout = BindGroupLayouts.forDevice(device).sceneBindGroupLayout,
    modelLayout: GPUBindGroupLayout = BindGroupLayouts.forDevice(device).modelBindGroupLayout,
  ) {
    this.bindGroupLayout ??= this.getMaterialLayout(device, []);
    const pipelineLayout = this.getPipelineLayout(device, sceneLayout, modelLayout);
    this.pipeline = this.getPipeline(device, format, shader, pipelineLayout);
    this.createBindGroup(device);
  }

  /** 子类只声明布局内容，缓存规则集中在这里。 */
  protected getMaterialLayout(device: GPUDevice, entries: GPUBindGroupLayoutEntry[]) {
    return getPipelineCache(device).bindGroupLayout(
      pipelineKeys.materialLayout(this.materialKind),
      () =>
        device.createBindGroupLayout({
          label: this.resourceLabel("bind-group-layout"),
          entries,
        }),
    );
  }

  private getPipelineLayout(
    device: GPUDevice,
    scene: GPUBindGroupLayout,
    model: GPUBindGroupLayout,
  ) {
    const cache = getPipelineCache(device);
    const layouts = [scene, this.bindGroupLayout!, model];
    return cache.pipelineLayout(
      pipelineKeys.pipelineLayout(layouts.map((layout) => cache.getResourceId(layout))),
      () =>
        device.createPipelineLayout({
          label: this.resourceLabel("pipeline-layout"),
          bindGroupLayouts: layouts,
        }),
    );
  }

  private getPipeline(
    device: GPUDevice,
    format: GPUTextureFormat,
    shader: Shader,
    pipelineLayout: GPUPipelineLayout,
  ) {
    const resourceCache = getPipelineCache(device);
    const vertexBufferLayouts = this.getVertexBufferLayouts();
    const depthStencil = this.getDepthStencilConfig();
    const pipelineKey = pipelineKeys.renderPipeline({
      tag: this.materialKind,
      shaderId: shader.id,
      format,
      pipelineLayout: resourceCache.getResourceId(pipelineLayout),
      enableFragment: this.enableFragment,
      topology: this.topology,
      cullMode: this.cullMode,
      vertexBufferLayouts,
      depthStencil,
    });
    return resourceCache.renderPipeline(pipelineKey, () =>
      this.createPipeline(
        device,
        format,
        shader,
        pipelineLayout,
        vertexBufferLayouts,
        depthStencil,
      ),
    );
  }

  private createPipeline(
    device: GPUDevice,
    format: GPUTextureFormat,
    shader: Shader,
    pipelineLayout: GPUPipelineLayout,
    vertexBufferLayouts: GPUVertexBufferLayout[],
    depthStencil: GPUDepthStencilState,
  ) {
    return device.createRenderPipeline({
      label: this.label,
      layout: pipelineLayout,
      vertex: {
        module: shader.module,
        entryPoint: "vs_main",
        buffers: vertexBufferLayouts,
      },
      ...(this.enableFragment
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
  }

  protected createBindGroup(device: GPUDevice) {
    if (!this.bindGroupLayout) return;

    this.bindGroup = device.createBindGroup({
      label: this.resourceLabel("bind-group"),
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

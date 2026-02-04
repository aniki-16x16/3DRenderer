import { Engine } from "../core/Engine";
import { Scene } from "../scene/Scene";
import { Object3D } from "../core/Object3D";

// 暴露这两个 Layout，供 Material 使用
// Group 0: Camera (Frame Level)
// Group 1: Material (Material Level) -> 由 Material 决定
// Group 2: Model (Object Level)
export class ForwardRenderer {
  engine: Engine;

  public cameraBindGroupLayout: GPUBindGroupLayout; // Group 0
  public modelBindGroupLayout: GPUBindGroupLayout; // Group 2 (was 1)

  private cameraBuffer: GPUBuffer;
  private cameraBindGroup: GPUBindGroup;

  private depthTexture: GPUTexture | null = null;

  constructor(engine: Engine) {
    this.engine = engine;
    const device = engine.device!;

    // Group 0: Camera ViewProjection
    this.cameraBindGroupLayout = device.createBindGroupLayout({
      label: "camera-bind-group-layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });

    // Group 2: Model Matrix
    this.modelBindGroupLayout = device.createBindGroupLayout({
      label: "model-bind-group-layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });

    // 初始化全局 Camera 资源
    this.cameraBuffer = device.createBuffer({
      label: "GlobalCameraBuffer",
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.cameraBindGroup = device.createBindGroup({
      label: "GlobalCameraBindGroup",
      layout: this.cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraBuffer } }],
    });
  }

  resize(width: number, height: number) {
    if (this.depthTexture) {
      this.depthTexture.destroy();
    }
    this.depthTexture = this.engine.device!.createTexture({
      label: "DepthTexture",
      size: [width, height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  render(scene: Scene) {
    const device = this.engine.device!;
    const context = this.engine.context!;
    const camera = scene.activeCamera;

    if (!camera) return;

    // 1. 更新全局 Camera Buffer
    camera.updateMatrix();
    const vpMatrix = camera.getViewProjectionMatrix();
    device.queue.writeBuffer(this.cameraBuffer, 0, vpMatrix.buffer);

    const textureView = context.getCurrentTexture().createView();
    const commandEncoder = device.createCommandEncoder();
    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: this.depthTexture!.createView(),
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    };
    const pass = commandEncoder.beginRenderPass(renderPassDescriptor);

    // 2. 绑定 Group 0 (Frame Level) - 只需一次
    pass.setBindGroup(0, this.cameraBindGroup);

    // 3. 排序物体 (按 Material ID / Pipeline 排序)
    // 假设 Material 实例是复用的，这里简单按 Material 对象引用或 ID 排序
    const sortedObjects = [...scene.objects].sort((a, b) => {
      if (!a.material || !b.material) return 0;
      // 这里只是简单的示例，实际可以使用 material.id
      return a.material.label.localeCompare(b.material.label);
    });

    // 记录上一次使用的 Pipeline 和 Material BindGroup，避免重复绑定
    let currentPipeline: GPURenderPipeline | null = null;
    let currentMaterialGroup: GPUBindGroup | null = null;

    for (const obj of sortedObjects) {
      if (
        !obj.mesh ||
        !obj.material ||
        !obj.mesh.vertexBuffer ||
        !obj.material.pipeline
      ) {
        continue;
      }

      // 切换 Pipeline
      if (currentPipeline !== obj.material.pipeline) {
        pass.setPipeline(obj.material.pipeline);
        currentPipeline = obj.material.pipeline;
      }

      // 绑定 Group 1 (Material Level)
      // 假设 Material 类有一个 bindGroup 属性
      const matGroup = obj.material.bindGroup;
      if (matGroup && currentMaterialGroup !== matGroup) {
        pass.setBindGroup(1, matGroup);
        currentMaterialGroup = matGroup;
      }

      this.renderObject(device, pass, obj);
    }

    pass.end();
    device.queue.submit([commandEncoder.finish()]);
  }

  private renderObject(
    device: GPUDevice,
    pass: GPURenderPassEncoder,
    obj: Object3D,
  ) {
    // 惰性初始化/更新 Model Buffer
    if (!obj.modelBuffer) {
      obj.modelBuffer = device.createBuffer({
        label: `ModelBuffer-${obj.name}`,
        size: 16 * 4,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    // 写入最新 Model Matrix
    const modelMatrix = obj.transform.getMatrix();
    device.queue.writeBuffer(obj.modelBuffer, 0, modelMatrix.buffer);

    if (!obj.modelBindGroup) {
      obj.modelBindGroup = device.createBindGroup({
        label: `ModelBindGroup-${obj.name}`,
        layout: this.modelBindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: { buffer: obj.modelBuffer },
          },
        ],
      });
    }

    // 绑定 Group 2 (Model)
    pass.setBindGroup(2, obj.modelBindGroup);

    // 绘制
    pass.setVertexBuffer(0, obj.mesh!.vertexBuffer!);
    pass.draw(obj.mesh!.vertexCount, 1, 0, 0);
  }
}

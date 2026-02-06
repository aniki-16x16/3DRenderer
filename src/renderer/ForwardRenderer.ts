import { Engine } from "../core/Engine";
import { Scene } from "../scene/Scene";
import { Object3D } from "../core/Object3D";
import { StandardLayouts } from "../graphics/StandardLayouts";

// 暴露这两个 Layout，供 Material 使用
// Group 0: Camera (Frame Level) -> StandardLayouts
// Group 1: Material (Material Level) -> 由 Material 决定
// Group 2: Model (Object Level) -> StandardLayouts
export class ForwardRenderer {
  engine: Engine;

  private cameraBuffer: GPUBuffer;
  private cameraBindGroup: GPUBindGroup;

  private depthTexture: GPUTexture | null = null;

  constructor(engine: Engine) {
    this.engine = engine;
    const device = engine.device!;

    // 初始化全局 Camera 资源
    this.cameraBuffer = device.createBuffer({
      label: "GlobalCameraBuffer",
      size: (4 * 4 + 3 + 1) * 4, // vp_matrix (16 floats) + camera_position (vec3) + time (float)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.cameraBindGroup = device.createBindGroup({
      label: "GlobalCameraBindGroup",
      layout: StandardLayouts.cameraBindGroupLayout,
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

    camera.updateMatrix();
    const vpMatrix = camera.getViewProjectionMatrix();
    const bufferData = new Float32Array(16 + 3 + 1);
    bufferData.set(vpMatrix, 0);
    bufferData.set(camera.position, 16);
    bufferData[19] = performance.now() / 1000; // time in seconds
    device.queue.writeBuffer(this.cameraBuffer, 0, bufferData);

    this.sortObjectsByMaterial(scene.objects);

    const textureView = context.getCurrentTexture().createView();
    const commandEncoder = device.createCommandEncoder();

    const mainPass = commandEncoder.beginRenderPass({
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
    });
    this.drawObjects(mainPass, scene.objects);
    mainPass.end();
    device.queue.submit([commandEncoder.finish()]);
  }

  private drawObjects(pass: GPURenderPassEncoder, objects: Object3D[]) {
    // 绑定 Group 0 (Frame Level) - 只需一次
    pass.setBindGroup(0, this.cameraBindGroup);

    // 记录上一次使用的 Pipeline 和 Material BindGroup，避免重复绑定
    let currentPipeline: GPURenderPipeline | null = null;
    let currentMaterialGroup: GPUBindGroup | null = null;

    for (const obj of objects) {
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

      this.renderObject(this.engine.device!, pass, obj);
    }
  }

  private renderObject(
    device: GPUDevice,
    pass: GPURenderPassEncoder,
    obj: Object3D,
  ) {
    // 写入最新 Model Matrix
    const modelMatrix = obj.transform.getMatrix();
    device.queue.writeBuffer(obj.modelBuffer!, 0, modelMatrix.buffer);

    // 绑定 Group 2 (Model)
    pass.setBindGroup(2, obj.modelBindGroup);

    // 绘制
    pass.setVertexBuffer(0, obj.mesh!.vertexBuffer!);
    if (obj.mesh!.normalBuffer) {
      pass.setVertexBuffer(1, obj.mesh!.normalBuffer!);
    }
    if (obj.mesh!.uvBuffer) {
      pass.setVertexBuffer(2, obj.mesh!.uvBuffer!);
    }

    if (obj.mesh!.indexBuffer) {
      const indexFormat: GPUIndexFormat =
        obj.mesh!.indexBuffer instanceof Uint32Array ? "uint32" : "uint16";
      pass.setIndexBuffer(obj.mesh!.indexBuffer!, indexFormat);
      pass.drawIndexed(obj.mesh!.indexCount, 1, 0, 0, 0);
      return;
    }
    pass.draw(obj.mesh!.vertexCount, 1, 0, 0);
  }

  private sortObjectsByMaterial(objects: Object3D[]): Object3D[] {
    return objects.sort((a, b) => {
      if (!a.material || !b.material) return 0;
      if (a.material.TAG === b.material.TAG) {
        return a.material.ID - b.material.ID;
      }
      return a.material.TAG < b.material.TAG ? -1 : 1;
    });
  }
}

import { Engine } from "../core/Engine";
import { Scene } from "../scene/Scene";
import { Camera } from "../scene/Camera";
import { multiplyMatrices } from "../utils/math";
import { Object3D } from "../core/Object3D";

export class ForwardRenderer {
  engine: Engine;

  // 缓存一些通用的 BindGroupLayout，避免重复创建
  // 目前 MVP 是绑定在 Group 0 的 Binding 0
  private mvpBindGroupLayout: GPUBindGroupLayout;

  constructor(engine: Engine) {
    this.engine = engine;

    // 创建通用的 Uniform BindGroupLayout (Set 0)
    // 假设所有 Object 都用同样的 MVP 布局
    this.mvpBindGroupLayout = engine.device!.createBindGroupLayout({
      label: "mvp-binding-group-layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });
  }

  render(scene: Scene) {
    const device = this.engine.device!;
    const context = this.engine.context!;
    const camera = scene.activeCamera;

    if (!camera) {
      console.warn("No active camera in scene");
      return;
    }

    // 1. 更新相机的矩阵
    camera.updateMatrix();

    // 2. 准备 Pass
    // 这里需要 handle texture 失效的问题，所以每次 render 都要获取
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
      // 稍后这里需要加上 depthStencilAttachment
    };

    const pass = commandEncoder.beginRenderPass(renderPassDescriptor);

    // 3. 遍历渲染对象
    for (const obj of scene.objects) {
      this.renderObject(device, pass, obj, camera);
    }

    pass.end();
    device.queue.submit([commandEncoder.finish()]);
  }

  private renderObject(
    device: GPUDevice,
    pass: GPURenderPassEncoder,
    obj: Object3D,
    camera: Camera,
  ) {
    // 简单剔除：如果 Mesh 或 Material 没准备好就不画
    if (
      !obj.mesh ||
      !obj.material ||
      !obj.mesh.vertexBuffer ||
      !obj.material.pipeline
    ) {
      return;
    }

    // 1. 获取模型矩阵 (利用 Transform 的脏标记机制，只有变化时才重算)
    const modelMatrix = obj.transform.getMatrix();

    // 2. 计算 MVP 矩阵
    // 注意：每一帧 MVP 通常都会变 (因为 Camera 会动)，所以矩阵乘法难以避免
    // 优化点：可以在 Shader 中分别传 Model 和 ViewProjection，减少 CPU 端乘法
    // 但作为基础教学，先保持 CPU 端计算 MVP
    const mvp = multiplyMatrices([
      camera.getProjectionMatrix(),
      camera.getViewMatrix(),
      modelMatrix,
    ]);

    // 3. 资源初始化 (惰性初始化，仅一次)
    if (!obj.uniformBuffer) {
      obj.uniformBuffer = device.createBuffer({
        label: `UniformBuffer-${obj.name}`,
        size: 64, // 4x4 matrix * 4 bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    if (!obj.bindGroup) {
      obj.bindGroup = device.createBindGroup({
        label: `BindGroup-${obj.name}`,
        layout: this.mvpBindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: { buffer: obj.uniformBuffer },
          },
        ],
      });
    }

    // 4. 更新数据
    // writeBuffer 的开销比 createBuffer 小得多
    device.queue.writeBuffer(obj.uniformBuffer, 0, mvp.buffer);

    // 5. 绘制指令
    pass.setPipeline(obj.material.pipeline!);
    pass.setVertexBuffer(0, obj.mesh.vertexBuffer);
    pass.setBindGroup(0, obj.bindGroup);
    pass.draw(obj.mesh.vertexCount, 1, 0, 0);
  }
}

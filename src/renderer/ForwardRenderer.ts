import { Engine } from "../core/Engine";
import { Scene } from "../core/Scene";
import { Object3D } from "../core/Object3D";
import { StandardLayouts } from "../graphics/StandardLayouts";
import { shadowMaterial } from "../materials/Shadow";
import { Light } from "../core/Light";
import { comparisonSampler, linearSampler } from "../graphics/Texture";
import type { Material } from "../graphics/Material";
import { StandardVertexBufferSlot } from "../graphics/StandardVertexLayout";

const SHADOW_MAP_SIZE = 2048;

export class ForwardRenderer {
  engine: Engine;

  private cameraBuffer: GPUBuffer;
  private sceneBindGroup: GPUBindGroup;

  private depthTexture: GPUTexture | null = null;
  private depthTextureView: GPUTextureView | null = null;

  private shadowMap: GPUTexture;
  private shadowMapView: GPUTextureView;
  /**
   * 存放光源的VP矩阵
   */
  private shadowPassBuffer: GPUBuffer;
  private shadowPassBindGroup: GPUBindGroup;

  private lightBuffer: GPUBuffer;

  constructor(engine: Engine, lightNum = 1) {
    this.engine = engine;
    const device = engine.device!;

    this.shadowMap = device.createTexture({
      label: "ShadowDepthTexture",
      size: [SHADOW_MAP_SIZE, SHADOW_MAP_SIZE],
      format: "depth32float", // 阴影贴图通常需要更高精度
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.shadowMapView = this.shadowMap.createView();
    this.shadowPassBuffer = device.createBuffer({
      label: "ShadowPassBuffer",
      size: 4 * 4 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.shadowPassBindGroup = device.createBindGroup({
      label: "ShadowPassBindGroup",
      layout: StandardLayouts.shadowPassBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.shadowPassBuffer } }],
    });

    this.lightBuffer = device.createBuffer({
      label: "LightBuffer",
      size: Light.DataSize * lightNum,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.cameraBuffer = device.createBuffer({
      label: "GlobalCameraBuffer",
      size: (4 * 4 + 3 + 1) * 4, // vp_matrix (16 floats) + camera_position (vec3) + padding (float)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.sceneBindGroup = device.createBindGroup({
      label: "GlobalSceneBindGroup",
      layout: StandardLayouts.sceneBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: { buffer: this.lightBuffer } },
        {
          binding: 2,
          resource: linearSampler!,
        },
        {
          binding: 3,
          resource: this.shadowMapView,
        },
        {
          binding: 4,
          resource: comparisonSampler!,
        },
        { binding: 5, resource: { buffer: this.shadowPassBuffer } },
      ],
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
    this.depthTextureView = this.depthTexture.createView();
  }

  destroy() {
    this.depthTexture?.destroy();
    this.shadowMap.destroy();
    this.cameraBuffer.destroy();
    this.lightBuffer.destroy();
    this.shadowPassBuffer.destroy();
    this.depthTexture = null;
    this.depthTextureView = null;
  }

  render(scene: Scene) {
    const device = this.engine.device!;
    const context = this.engine.context!;
    const { activeCamera: camera, lights } = scene;

    if (!camera) return;

    {
      camera.updateMatrix();
      const vpMatrix = camera.getViewProjectionMatrix();
      const bufferData = new Float32Array(16 + 3);
      bufferData.set(vpMatrix, 0);
      bufferData.set(camera.position, 16);
      device.queue.writeBuffer(this.cameraBuffer, 0, bufferData);
    }

    {
      for (let i = 0; i < lights.length; i++) {
        const light = lights[i];
        device.queue.writeBuffer(
          this.lightBuffer,
          i * Light.DataSize,
          light.packData(),
        );
      }
      const light = lights[0]; // 目前先只处理第一个光源的阴影
      if (light.shadowCamera) {
        light.syncShadowCamera();
        light.shadowCamera.updateMatrix();
        const shadowVP = light.shadowCamera.getViewProjectionMatrix();
        device.queue.writeBuffer(this.shadowPassBuffer, 0, shadowVP.buffer);
      }
    }

    const renderObjects = this.sortObjectsByMaterial(scene.objects);

    const textureView = context.getCurrentTexture().createView();
    const commandEncoder = device.createCommandEncoder();

    const shadowPass = commandEncoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.shadowMapView,
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    shadowPass.setBindGroup(0, this.shadowPassBindGroup);
    this.drawObjects(shadowPass, renderObjects, shadowMaterial);
    shadowPass.end();

    const mainPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: this.depthTextureView!,
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    mainPass.setBindGroup(0, this.sceneBindGroup);
    this.drawObjects(mainPass, renderObjects);
    mainPass.end();
    device.queue.submit([commandEncoder.finish()]);
  }

  private drawObjects(
    pass: GPURenderPassEncoder,
    objects: Object3D[],
    overrideMaterial?: Material,
  ) {
    // 记录上一次使用的 Pipeline 和 Material BindGroup，避免重复绑定
    let currentPipeline: GPURenderPipeline | null = null;
    let currentMaterialGroup: GPUBindGroup | null = null;

    for (const obj of objects) {
      const material = overrideMaterial ?? obj.material;
      if (
        !obj.mesh ||
        !material ||
        !obj.mesh.vertexBuffer ||
        !material.pipeline
      ) {
        continue;
      }

      // 切换 Pipeline
      if (currentPipeline !== material.pipeline) {
        pass.setPipeline(material.pipeline);
        currentPipeline = material.pipeline;
      }

      // 绑定 Group 1 (Material Level)
      // 假设 Material 类有一个 bindGroup 属性
      const matGroup = material.bindGroup;
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
    pass.setVertexBuffer(
      StandardVertexBufferSlot.Position,
      obj.mesh!.vertexBuffer!,
    );
    if (obj.mesh!.normalBuffer) {
      pass.setVertexBuffer(
        StandardVertexBufferSlot.Normal,
        obj.mesh!.normalBuffer!,
      );
    }
    if (obj.mesh!.uvBuffer) {
      pass.setVertexBuffer(StandardVertexBufferSlot.UV, obj.mesh!.uvBuffer!);
    }
    if (obj.mesh!.tangentBuffer) {
      pass.setVertexBuffer(
        StandardVertexBufferSlot.Tangent,
        obj.mesh!.tangentBuffer!,
      );
    }

    if (obj.mesh!.indexBuffer) {
      pass.setIndexBuffer(obj.mesh!.indexBuffer!, obj.mesh!.indexFormat!);
      pass.drawIndexed(obj.mesh!.indexCount, 1, 0, 0, 0);
      return;
    }
    pass.draw(obj.mesh!.vertexCount, 1, 0, 0);
  }

  private sortObjectsByMaterial(objects: Object3D[]): Object3D[] {
    return [...objects].sort((a, b) => {
      if (!a.material || !b.material) return 0;
      if (a.material.TAG === b.material.TAG) {
        return a.material.ID - b.material.ID;
      }
      return a.material.TAG < b.material.TAG ? -1 : 1;
    });
  }
}

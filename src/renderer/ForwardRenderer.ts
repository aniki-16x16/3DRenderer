import { ResourceScope } from "../foundation/ResourceScope";
import { cameraLayout, modelLayout } from "../graphics/BufferLayouts";
import { SceneResources } from "./SceneResources";
import { Shader } from "../graphics/Shader";
import shadowCode from "../shaders/shadow.wgsl?raw";
import { Engine } from "../core/Engine";
import { Scene } from "../core/Scene";
import { Object3D } from "../core/Object3D";
import { StandardLayouts } from "../graphics/StandardLayouts";
import { ShadowMaterial } from "../materials/Shadow";
import { Light } from "../core/Light";
import { getSamplers } from "../graphics/Texture";
import type { Material } from "../graphics/Material";
import { StandardVertexBufferSlot } from "../graphics/StandardVertexLayout";

const SHADOW_MAP_SIZE = 2048;

export class ForwardRenderer {
  engine: Engine;
  private scope = new ResourceScope();

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
  private lightCapacity = 1;
  private cameraData = cameraLayout.create();
  private matrixData = modelLayout.create();
  private destroyed = false;
  private shadowMaterial = new ShadowMaterial();
  readonly resources: SceneResources;

  constructor(engine: Engine) {
    this.engine = engine;
    const device = engine.device;
    if (!device || !engine.format || !engine.context) throw new Error("Initialize Engine before constructing ForwardRenderer");
    try {
      this.resources = this.scope.own(new SceneResources(device, engine.format));
      this.scope.own(this.shadowMaterial);
      this.shadowMaterial.initialize(device, engine.format, new Shader(device, "shadow", shadowCode), StandardLayouts.forDevice(device).shadowPassBindGroupLayout);

      this.shadowMap = this.scope.own(device.createTexture({
        label: "ShadowDepthTexture",
        size: [SHADOW_MAP_SIZE, SHADOW_MAP_SIZE],
        format: "depth32float", // 阴影贴图通常需要更高精度
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      }));
      this.shadowMapView = this.shadowMap.createView();
      this.shadowPassBuffer = this.scope.own(device.createBuffer({
        label: "ShadowPassBuffer",
        size: modelLayout.byteSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }));
      this.shadowPassBindGroup = device.createBindGroup({
        label: "ShadowPassBindGroup",
        layout: StandardLayouts.forDevice(device).shadowPassBindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: this.shadowPassBuffer } }],
      });

      this.lightBuffer = this.scope.own(device.createBuffer({
        label: "LightBuffer",
        size: Light.DataSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }));
      this.cameraBuffer = this.scope.own(device.createBuffer({
        label: "GlobalCameraBuffer",
        size: cameraLayout.byteSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }));
      this.sceneBindGroup = this.createSceneBindGroup();
    } catch (error) {
      this.scope.destroy();
      throw error;
    }
  }

  private createSceneBindGroup() {
    const device = this.engine.device!;
    return device.createBindGroup({
      label: "GlobalSceneBindGroup",
      layout: StandardLayouts.forDevice(device).sceneBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: { buffer: this.lightBuffer } },
        {
          binding: 2,
          resource: getSamplers(device).linear,
        },
        {
          binding: 3,
          resource: this.shadowMapView,
        },
        {
          binding: 4,
          resource: getSamplers(device).comparison,
        },
        { binding: 5, resource: { buffer: this.shadowPassBuffer } },
      ],
    });
  }

  resize(width: number, height: number) {
    if (this.destroyed) throw new Error("Renderer has been destroyed");
    width = Math.max(1, width); height = Math.max(1, height);
    if (this.depthTexture) {
      this.scope.release(this.depthTexture);
    }
    this.depthTexture = this.scope.own(this.engine.device!.createTexture({
      label: "DepthTexture",
      size: [width, height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    }));
    this.depthTextureView = this.depthTexture.createView();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scope.destroy();
    this.depthTexture = null;
    this.depthTextureView = null;
  }

  render(scene: Scene) {
    if (this.destroyed) throw new Error("Renderer has been destroyed");
    const device = this.engine.device!;
    const context = this.engine.context!;
    const { activeCamera: camera, lights } = scene;

    if (!camera) return;
    this.resources.prepare(scene);
    if (!this.depthTexture || this.depthTexture.width !== this.engine.canvas.width || this.depthTexture.height !== this.engine.canvas.height) {
      this.resize(this.engine.canvas.width, this.engine.canvas.height);
    }
    this.ensureLightCapacity(lights.length);

    {
      camera.updateMatrix();
      const vpMatrix = camera.getViewProjectionMatrix();
      cameraLayout.write(this.cameraData, { vp_matrix: vpMatrix, position: camera.position, light_count: lights.length });
      device.queue.writeBuffer(this.cameraBuffer, 0, this.cameraData);
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
      if (light?.shadowCamera) {
        light.syncShadowCamera();
        light.shadowCamera.updateMatrix();
        const shadowVP = light.shadowCamera.getViewProjectionMatrix();
        modelLayout.write(this.matrixData, { matrix: shadowVP });
        device.queue.writeBuffer(this.shadowPassBuffer, 0, this.matrixData);
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
    this.drawObjects(shadowPass, renderObjects, this.shadowMaterial);
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

  private ensureLightCapacity(count: number) {
    if (count <= this.lightCapacity) return;
    const device = this.engine.device!;
    const limit = Math.floor(Math.min(device.limits.maxStorageBufferBindingSize, device.limits.maxBufferSize) / Light.DataSize);
    if (count > limit) throw new RangeError(`Scene has ${count} lights; device supports ${limit}`);
    const capacity = Math.min(limit, Math.max(count, this.lightCapacity * 2));
    const previous = this.lightBuffer;
    this.lightBuffer = this.scope.own(device.createBuffer({ label: "LightBuffer", size: Light.DataSize * capacity, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }));
    this.lightCapacity = capacity;
    this.sceneBindGroup = this.createSceneBindGroup();
    this.scope.release(previous);
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
    modelLayout.write(this.matrixData, { matrix: modelMatrix });
    device.queue.writeBuffer(obj.modelBuffer!, 0, this.matrixData);

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

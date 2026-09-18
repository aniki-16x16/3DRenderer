import type { Camera } from "../scene/Camera";
import { Light } from "../scene/Light";
import type { Texture } from "../assets/Texture";
import type { TextureResources } from "../assets/TextureResources";
import { getSamplers } from "../gpu/Samplers";
import { ResourceScope } from "../utils/ResourceScope";
import { cameraLayout } from "./layouts/BufferLayouts";
import { BindGroupLayouts } from "./layouts/BindGroupLayouts";

/** 拥有逐帧 Buffer 和场景绑定；环境纹理、阴影深度与矩阵只借用。 */
export class FrameBindings {
  private readonly scope = new ResourceScope();
  private readonly device: GPUDevice;
  private readonly textures: TextureResources;
  private readonly shadowMap: GPUTextureView;
  private readonly shadowMatrix: GPUBuffer;
  private readonly cameraBuffer: GPUBuffer;
  private readonly timeBuffer: GPUBuffer;
  private lightBuffer: GPUBuffer;
  private lightCapacity = 1;
  private readonly cameraData = cameraLayout.create();
  private readonly timeData = new Float32Array(1);
  private environmentView: GPUTextureView;
  private sceneBindGroup: GPUBindGroup;

  constructor(
    device: GPUDevice,
    textures: TextureResources,
    shadowMap: GPUTextureView,
    shadowMatrix: GPUBuffer,
  ) {
    this.device = device;
    this.textures = textures;
    this.shadowMap = shadowMap;
    this.shadowMatrix = shadowMatrix;
    try {
      this.cameraBuffer = this.createBuffer(
        "CameraBuffer",
        cameraLayout.byteSize,
        GPUBufferUsage.UNIFORM,
      );
      this.timeBuffer = this.createBuffer(
        "TimeBuffer",
        this.timeData.byteLength,
        GPUBufferUsage.UNIFORM,
      );
      this.lightBuffer = this.createBuffer("LightBuffer", Light.byteSize, GPUBufferUsage.STORAGE);
      this.environmentView = textures.black.view;
      this.sceneBindGroup = this.createBindGroup(this.lightBuffer, this.environmentView);
    } catch (error) {
      this.scope.destroy();
      throw error;
    }
  }

  get bindGroup(): GPUBindGroup {
    return this.sceneBindGroup;
  }

  private createBuffer(role: string, size: number, usage: GPUBufferUsageFlags): GPUBuffer {
    return this.scope.own(
      this.device.createBuffer({
        label: `FrameBindings-${role}`,
        size,
        usage: usage | GPUBufferUsage.COPY_DST,
      }),
    );
  }

  private createBindGroup(lights: GPUBuffer, environment: GPUTextureView): GPUBindGroup {
    const samplers = getSamplers(this.device);
    return this.device.createBindGroup({
      label: "FrameBindings-SceneBindGroup",
      layout: BindGroupLayouts.forDevice(this.device).sceneBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: { buffer: lights } },
        { binding: 2, resource: { buffer: this.timeBuffer } },
        { binding: 3, resource: samplers.linear },
        { binding: 4, resource: this.shadowMap },
        { binding: 5, resource: samplers.comparison },
        { binding: 6, resource: { buffer: this.shadowMatrix } },
        { binding: 7, resource: environment },
        { binding: 8, resource: samplers.environment },
      ],
    });
  }

  update(
    camera: Camera,
    lights: readonly Light[],
    elapsedSeconds: number,
    environment: Texture | null,
  ): void {
    if (this.scope.destroyed) throw new Error("FrameBindings has been destroyed");
    environment?.assertUsable(this.device);
    this.updateBindingResources(lights.length, environment?.view ?? this.textures.black.view);
    this.timeData[0] = elapsedSeconds;
    this.device.queue.writeBuffer(this.timeBuffer, 0, this.timeData);
    camera.updateMatrix();
    cameraLayout.write(this.cameraData, {
      vp_matrix: camera.getViewProjectionMatrix(),
      position: camera.position,
      light_count: lights.length,
    });
    this.device.queue.writeBuffer(this.cameraBuffer, 0, this.cameraData);
    for (let i = 0; i < lights.length; i++) {
      this.device.queue.writeBuffer(this.lightBuffer, i * Light.byteSize, lights[i].packGpuData());
    }
  }

  /** 扩容和环境替换合并成一次绑定更新，成功后才释放旧 Buffer。 */
  private updateBindingResources(count: number, environment: GPUTextureView): void {
    let capacity = this.lightCapacity;
    if (count > capacity) {
      const limit = Math.floor(
        Math.min(this.device.limits.maxStorageBufferBindingSize, this.device.limits.maxBufferSize) /
          Light.byteSize,
      );
      if (count > limit)
        throw new RangeError(`Scene has ${count} lights; device supports ${limit}`);
      capacity = Math.min(limit, Math.max(count, capacity * 2));
    }
    if (capacity === this.lightCapacity && environment === this.environmentView) return;
    const next =
      capacity === this.lightCapacity
        ? this.lightBuffer
        : this.createBuffer("LightBuffer", Light.byteSize * capacity, GPUBufferUsage.STORAGE);
    let group: GPUBindGroup;
    try {
      group = this.createBindGroup(next, environment);
    } catch (error) {
      if (next !== this.lightBuffer) this.scope.release(next);
      throw error;
    }
    const previous = this.lightBuffer;
    this.lightBuffer = next;
    this.lightCapacity = capacity;
    this.environmentView = environment;
    this.sceneBindGroup = group;
    if (previous !== next) this.scope.release(previous);
  }

  destroy(): void {
    this.scope.destroy();
  }
}

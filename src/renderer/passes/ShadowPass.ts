import type { Light } from "../../scene/Light";
import type { Object3D } from "../../scene/Object3D";
import { Shader } from "../../gpu/Shader";
import { ResourceScope } from "../../utils/ResourceScope";
import { modelLayout } from "../layouts/BufferLayouts";
import { BindGroupLayouts } from "../layouts/BindGroupLayouts";
import { drawObjects } from "../drawObjects";
import { ShadowMaterial } from "./ShadowMaterial";

const SHADOW_MAP_SIZE = 2048;

/** 阴影专用资源和命令；主场景仅借用 depthView 与 matrixBuffer。 */
export class ShadowPass {
  private readonly scope = new ResourceScope();
  private readonly device: GPUDevice;
  private readonly material = new ShadowMaterial();
  private readonly bindGroup: GPUBindGroup;
  private readonly matrixData = modelLayout.create();
  readonly depthView: GPUTextureView;
  readonly matrixBuffer: GPUBuffer;

  constructor(device: GPUDevice, format: GPUTextureFormat) {
    this.device = device;
    try {
      this.scope.own(this.material);
      this.material.initialize(
        device,
        format,
        new Shader(device, "shadow", this.material.shaderSource),
        BindGroupLayouts.forDevice(device).shadowPassBindGroupLayout,
      );
      const texture = this.scope.own(
        device.createTexture({
          label: "ShadowPass-DepthTexture",
          size: [SHADOW_MAP_SIZE, SHADOW_MAP_SIZE],
          format: "depth32float",
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        }),
      );
      this.depthView = texture.createView();
      this.matrixBuffer = this.scope.own(
        device.createBuffer({
          label: "ShadowPass-MatrixBuffer",
          size: modelLayout.byteSize,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        }),
      );
      this.bindGroup = device.createBindGroup({
        label: "ShadowPass-BindGroup",
        layout: BindGroupLayouts.forDevice(device).shadowPassBindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: this.matrixBuffer } }],
      });
    } catch (error) {
      this.scope.destroy();
      throw error;
    }
  }

  update(light: Light | undefined): void {
    if (this.scope.destroyed) throw new Error("ShadowPass has been destroyed");
    // 保持现有规则：只处理第一个光源的阴影。
    if (!light?.shadowCamera) return;
    light.syncShadowCamera();
    light.shadowCamera.updateMatrix();
    modelLayout.write(this.matrixData, { matrix: light.shadowCamera.getViewProjectionMatrix() });
    this.device.queue.writeBuffer(this.matrixBuffer, 0, this.matrixData);
  }

  encode(encoder: GPUCommandEncoder, objects: readonly Object3D[]): void {
    if (this.scope.destroyed) throw new Error("ShadowPass has been destroyed");
    const pass = encoder.beginRenderPass({
      label: "ShadowPass",
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.depthView,
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });
    pass.setBindGroup(0, this.bindGroup);
    drawObjects(pass, objects, this.material);
    pass.end();
  }

  destroy(): void {
    this.scope.destroy();
  }
}

import { pbrLayout } from "../graphics/BufferLayouts";
import { getResourceCache } from "../graphics/ResourceCache";
import { Material } from "../graphics/Material";
import type { Shader } from "../graphics/Shader";
import { standardVertexBufferLayouts } from "../graphics/StandardVertexLayout";

interface Props {
  label?: string;
  baseColor: [number, number, number, number];
  metallic: number;
  roughness: number;
}
export class PBRMaterial extends Material {
  protected _TAG: string = "PBR";

  baseColor: Float32Array;
  metallic: number;
  roughness: number;
  uniformBuffer: GPUBuffer | null = null;

  constructor(props: Props) {
    super(props.label ?? "PBRMaterial");
    this.baseColor = new Float32Array(props.baseColor);
    this.metallic = props.metallic;
    this.roughness = props.roughness;
  }

  initialize(
    device: GPUDevice,
    format: GPUTextureFormat,
    shader: Shader,
  ): void {
    // 1. 创建 Uniform Buffer
    this.uniformBuffer?.destroy();
    this.uniformBuffer = device.createBuffer({
      label: `${this.label}-uniform-buffer`,
      size: pbrLayout.byteSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    pbrLayout.write(this.uniformBuffer.getMappedRange(), { base_color: this.baseColor, metallic: this.metallic, roughness: this.roughness });
    this.uniformBuffer.unmap();

    // 2. 创建 BindGroupLayout (Group 1)
    const resourceCache = getResourceCache(device);
    const materialLayoutKey = `material-layout:${this._TAG}`;
    const cachedBindLayout =
      resourceCache.getBindGroupLayout(materialLayoutKey);
    if (cachedBindLayout) {
      this.bindGroupLayout = cachedBindLayout;
    } else {
      this.bindGroupLayout = device.createBindGroupLayout({
        label: `${this.label}-bind-group-layout`,
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" },
          },
        ],
      });
      resourceCache.setBindGroupLayout(materialLayoutKey, this.bindGroupLayout);
    }

    // 3. 调用父类的初始化，创建 Pipeline
    super.initialize(device, format, shader);
  }

  protected createBindGroup(device: GPUDevice) {
    this.bindGroup = device.createBindGroup({
      label: `${this.label}-bind-group`,
      layout: this.bindGroupLayout!,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.uniformBuffer! },
        },
      ],
    });
  }

  protected getVertexBufferLayouts(): GPUVertexBufferLayout[] {
    return standardVertexBufferLayouts;
  }

  override destroy() {
    this.uniformBuffer?.destroy();
    this.uniformBuffer = null;
    super.destroy();
  }
}

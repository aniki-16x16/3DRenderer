import { phongLayout } from "../graphics/BufferLayouts";
import { getResourceCache } from "../graphics/ResourceCache";
import { Material } from "../graphics/Material";
import type { Shader } from "../graphics/Shader";
import type { Texture } from "../graphics/Texture";
import { standardVertexBufferLayouts } from "../graphics/StandardVertexLayout";
import { getNormalTexture } from "../textures/normal";
import { getWhiteTexture } from "../textures/white";

interface Props {
  label?: string;
  color: [number, number, number];
  specColor?: [number, number, number];
  shininess?: number;
  texture?: Texture;
  normalTexture?: Texture;
}
export class PhongMaterial extends Material {
  protected _TAG: string = "Phong";

  color: Float32Array | null = null;
  specColor: Float32Array | null = null;
  shininess: number = 32.0;
  uniformBuffer: GPUBuffer | null = null;
  texture: Texture | null = null;
  normalTexture: Texture | null = null;

  constructor(props: Props) {
    super(props.label ?? "PhongMaterial");
    const [r, g, b] = props.color;
    this.color = new Float32Array([r, g, b, 1.0]);
    this.specColor = new Float32Array(props.specColor ?? [1.0, 1.0, 1.0]);
    this.shininess = props.shininess ?? 32.0;
    this.texture = props.texture ?? null;
    this.normalTexture = props.normalTexture ?? null;
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
      size: phongLayout.byteSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    phongLayout.write(this.uniformBuffer.getMappedRange(), { color: this.color!, spec_color: this.specColor!, shininess: this.shininess });
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
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            texture: {},
          },
          {
            binding: 2,
            visibility: GPUShaderStage.FRAGMENT,
            texture: {},
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
        {
          binding: 1,
          resource: (this.texture ?? getWhiteTexture(device)).view!,
        },
        {
          binding: 2,
          resource: (this.normalTexture ?? getNormalTexture(device)).view!,
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

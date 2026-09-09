import { solidColorLayout } from "../graphics/BufferLayouts";
import { getResourceCache } from "../graphics/ResourceCache";
import { Material } from "../graphics/Material";
import type { Shader } from "../graphics/Shader";

interface Props {
  label?: string;
  r: number;
  g: number;
  b: number;
  a?: number;
}
export class SolidColorMaterial extends Material {
  protected _TAG: string = "SolidColor";

  color: Float32Array | null = null;
  uniformBuffer: GPUBuffer | null = null;

  constructor(props: Props) {
    super(props.label ?? "SolidColorMaterial");
    const { r, g, b, a = 1.0 } = props;
    this.color = new Float32Array([r, g, b, a]);
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
      size: solidColorLayout.byteSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    solidColorLayout.write(this.uniformBuffer.getMappedRange(), { color: this.color! });
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

  override destroy() {
    this.uniformBuffer?.destroy();
    this.uniformBuffer = null;
    super.destroy();
  }
}

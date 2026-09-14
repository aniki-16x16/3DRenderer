import { solidColorLayout } from "../graphics/BufferLayouts";
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

  initialize(device: GPUDevice, format: GPUTextureFormat, shader: Shader): void {
    // 1. 创建 Uniform Buffer
    this.uniformBuffer?.destroy();
    this.uniformBuffer = device.createBuffer({
      label: this.resourceLabel("uniform-buffer"),
      size: solidColorLayout.byteSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    solidColorLayout.write(this.uniformBuffer.getMappedRange(), { color: this.color! });
    this.uniformBuffer.unmap();

    // 2. 创建 BindGroupLayout (Group 1)
    this.bindGroupLayout = this.getMaterialLayout(device, [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
    ]);

    super.initialize(device, format, shader);
  }

  protected createBindGroup(device: GPUDevice) {
    this.bindGroup = device.createBindGroup({
      label: this.resourceLabel("bind-group"),
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

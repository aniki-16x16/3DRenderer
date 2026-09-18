import { UniformSync } from "../gpu/UniformSync";
import { solidColorLayout } from "../renderer/layouts/BufferLayouts";
import { Material } from "./Material";
import shaderSource from "./solid.wgsl?raw";
import type { Shader } from "../gpu/Shader";

interface Props {
  label?: string;
  r: number;
  g: number;
  b: number;
  a?: number;
}
export class SolidColorMaterial extends Material {
  override readonly shaderSource = shaderSource;
  protected materialKind: string = "SolidColor";

  color: Float32Array | null = null;
  uniformBuffer: GPUBuffer | null = null;
  private readonly uniformSync = new UniformSync(solidColorLayout.byteSize);

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
    });

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

  override syncUniforms(device: GPUDevice) {
    if (!this.uniformBuffer) throw new Error("Material is not initialized");
    solidColorLayout.write(this.uniformSync.data, { color: this.color! });
    this.uniformSync.upload(device, this.uniformBuffer);
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
    this.uniformSync.reset();
    super.destroy();
  }
}

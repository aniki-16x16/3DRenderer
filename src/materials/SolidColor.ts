import { globalResourceCache } from "../core/ResourceCache";
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
    frameLayout: GPUBindGroupLayout,
    modelLayout: GPUBindGroupLayout,
  ): void {
    // 1. 创建 Uniform Buffer
    this.uniformBuffer = device.createBuffer({
      label: `${this.label}-uniform-buffer`,
      size: 4 * 4, // vec4
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.uniformBuffer.getMappedRange()).set(this.color!);
    this.uniformBuffer.unmap();

    // 2. 创建 BindGroupLayout (Group 1)
    const cachedBindLayout = globalResourceCache.getBindGroupLayout(this._TAG);
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
      globalResourceCache.setBindGroupLayout(this._TAG, this.bindGroupLayout);
    }

    // 3. 调用父类的初始化，创建 Pipeline
    super.initialize(device, format, shader, frameLayout, modelLayout);
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
}

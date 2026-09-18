import { UniformSync } from "../gpu/UniformSync";
import { pbrLayout } from "../renderer/layouts/BufferLayouts";
import { Material } from "./Material";
import shaderSource from "./pbr.wgsl?raw";
import type { Shader } from "../gpu/Shader";
import { vertexBufferLayouts } from "../renderer/layouts/VertexLayouts";

interface Props {
  label?: string;
  baseColor: [number, number, number, number];
  metallic: number;
  roughness: number;
}
export class PBRMaterial extends Material {
  override readonly shaderSource = shaderSource;
  protected materialKind: string = "PBR";

  baseColor: Float32Array;
  metallic: number;
  roughness: number;
  uniformBuffer: GPUBuffer | null = null;
  private readonly uniformSync = new UniformSync(pbrLayout.byteSize);

  constructor(props: Props) {
    super(props.label ?? "PBRMaterial");
    this.baseColor = new Float32Array(props.baseColor);
    this.metallic = props.metallic;
    this.roughness = props.roughness;
  }

  initialize(device: GPUDevice, format: GPUTextureFormat, shader: Shader): void {
    // 1. 创建 Uniform Buffer
    this.uniformBuffer?.destroy();
    this.uniformBuffer = device.createBuffer({
      label: this.resourceLabel("uniform-buffer"),
      size: pbrLayout.byteSize,
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
    pbrLayout.write(this.uniformSync.data, {
      base_color: this.baseColor,
      metallic: this.metallic,
      roughness: this.roughness,
    });
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

  protected getVertexBufferLayouts(): GPUVertexBufferLayout[] {
    return vertexBufferLayouts;
  }

  override destroy() {
    this.uniformBuffer?.destroy();
    this.uniformBuffer = null;
    this.uniformSync.reset();
    super.destroy();
  }
}

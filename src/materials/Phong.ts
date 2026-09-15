import { phongLayout } from "../graphics/BufferLayouts";
import { Material } from "../graphics/Material";
import type { Shader } from "../graphics/Shader";
import type { Texture } from "../graphics/Texture";
import { standardVertexBufferLayouts } from "../graphics/StandardVertexLayout";
import type { TextureResources } from "../graphics/TextureResources";

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
  private colorView?: GPUTextureView;
  private normalView?: GPUTextureView;

  override prepareResources(device: GPUDevice, textures: TextureResources) {
    const color = this.texture ?? textures.white;
    const normal = this.normalTexture ?? textures.normal;
    color.assertUsable(device);
    normal.assertUsable(device);
    if (this.colorView === color.view && this.normalView === normal.view) return;
    const previousColor = this.colorView;
    const previousNormal = this.normalView;
    this.colorView = color.view;
    this.normalView = normal.view;
    try {
      if (this.bindGroup) this.createBindGroup(device);
    } catch (error) {
      this.colorView = previousColor;
      this.normalView = previousNormal;
      throw error;
    }
  }

  constructor(props: Props) {
    super(props.label ?? "PhongMaterial");
    const [r, g, b] = props.color;
    this.color = new Float32Array([r, g, b, 1.0]);
    this.specColor = new Float32Array(props.specColor ?? [1.0, 1.0, 1.0]);
    this.shininess = props.shininess ?? 32.0;
    this.texture = props.texture ?? null;
    this.normalTexture = props.normalTexture ?? null;
  }

  initialize(device: GPUDevice, format: GPUTextureFormat, shader: Shader): void {
    // 1. 创建 Uniform Buffer
    this.uniformBuffer?.destroy();
    this.uniformBuffer = device.createBuffer({
      label: this.resourceLabel("uniform-buffer"),
      size: phongLayout.byteSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    phongLayout.write(this.uniformBuffer.getMappedRange(), {
      color: this.color!,
      spec_color: this.specColor!,
      shininess: this.shininess,
    });
    this.uniformBuffer.unmap();

    // 2. 创建 BindGroupLayout (Group 1)
    this.bindGroupLayout = this.getMaterialLayout(device, [
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
    ]);

    super.initialize(device, format, shader);
  }

  protected createBindGroup(device: GPUDevice) {
    if (!this.colorView || !this.normalView)
      throw new Error("Prepare material resources before initialization");
    this.bindGroup = device.createBindGroup({
      label: this.resourceLabel("bind-group"),
      layout: this.bindGroupLayout!,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.uniformBuffer! },
        },
        {
          binding: 1,
          resource: this.colorView,
        },
        {
          binding: 2,
          resource: this.normalView,
        },
      ],
    });
  }

  protected getVertexBufferLayouts(): GPUVertexBufferLayout[] {
    return standardVertexBufferLayouts;
  }

  override destroy() {
    this.colorView = undefined;
    this.normalView = undefined;
    this.uniformBuffer?.destroy();
    this.uniformBuffer = null;
    super.destroy();
  }
}

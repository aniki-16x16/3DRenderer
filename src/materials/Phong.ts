import { globalResourceCache } from "../core/ResourceCache";
import { Material } from "../graphics/Material";
import type { Shader } from "../graphics/Shader";
import type { Texture } from "../graphics/Texture";
import { whiteTexture } from "../textures/white";

interface Props {
  label?: string;
  color: [number, number, number];
  specColor?: [number, number, number];
  shininess?: number;
  texture?: Texture;
}
export class PhongMaterial extends Material {
  protected _TAG: string = "Phong";

  color: Float32Array | null = null;
  specColor: Float32Array | null = null;
  shininess: number = 32.0;
  uniformBuffer: GPUBuffer | null = null;
  texture: Texture | null = null;

  constructor(props: Props) {
    super(props.label ?? "PhongMaterial");
    const [r, g, b] = props.color;
    this.color = new Float32Array([r, g, b, 1.0]);
    this.specColor = new Float32Array(props.specColor ?? [1.0, 1.0, 1.0]);
    this.shininess = props.shininess ?? 32.0;
    this.texture = props.texture ?? whiteTexture;
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
      size: (4 + 3 + 1) * 4, // vec4 + vec3 + float
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.uniformBuffer.getMappedRange()).set([
      ...this.color!,
      ...this.specColor!,
      this.shininess,
    ]);
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
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            texture: {},
          },
          {
            binding: 2,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: {},
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
        {
          binding: 1,
          resource: this.texture!.view!,
        },
        {
          binding: 2,
          resource: this.texture!.sampler!,
        },
      ],
    });
  }

  protected getVertextBufferLayouts(): GPUVertexBufferLayout[] {
    return [
      {
        arrayStride: 3 * 4, // position
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: "float32x3",
          },
        ],
      },
      {
        arrayStride: 3 * 4, // normal
        attributes: [
          {
            shaderLocation: 1,
            offset: 0,
            format: "float32x3",
          },
        ],
      },
      {
        arrayStride: 2 * 4, // uv
        attributes: [
          {
            shaderLocation: 2,
            offset: 0,
            format: "float32x2",
          },
        ],
      },
    ];
  }
}

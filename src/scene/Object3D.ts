import { modelLayout } from "../renderer/layouts/BufferLayouts";
import type { Material } from "../materials/Material";
import type { Mesh } from "../assets/Mesh";
import { BindGroupLayouts } from "../renderer/layouts/BindGroupLayouts";
import { Node3D } from "./Node3D";

export class Object3D extends Node3D {
  mesh: Mesh | null = null;
  material: Material | null = null;

  // 模型矩阵资源 (Group 2)
  modelBuffer: GPUBuffer | null = null;
  modelBindGroup: GPUBindGroup | null = null;

  constructor(name: string, mesh: Mesh, material: Material) {
    super(name);
    this.mesh = mesh;
    this.material = material;
  }

  initialize(device: GPUDevice) {
    this.destroy();

    this.modelBuffer = device.createBuffer({
      label: `ModelBuffer-${this.name}`,
      size: modelLayout.byteSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.modelBindGroup = device.createBindGroup({
      label: `ModelBindGroup-${this.name}`,
      layout: BindGroupLayouts.forDevice(device).modelBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.modelBuffer },
        },
      ],
    });
  }

  destroy() {
    this.modelBuffer?.destroy();
    this.modelBuffer = null;
    this.modelBindGroup = null;
  }
}

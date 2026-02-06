import { Transform } from "./Transform";
import type { Material } from "../graphics/Material";
import type { Mesh } from "../graphics/Mesh";
import { StandardLayouts } from "../graphics/StandardLayouts";

export class Object3D {
  name: string;
  transform = new Transform();
  mesh: Mesh | null = null;
  material: Material | null = null;

  // 模型矩阵资源 (Group 1)
  modelBuffer: GPUBuffer | null = null;
  modelBindGroup: GPUBindGroup | null = null;

  constructor(name: string, mesh: Mesh, material: Material) {
    this.name = name;
    this.mesh = mesh;
    this.material = material;
  }

  initialize(device: GPUDevice) {
    this.modelBuffer = device.createBuffer({
      label: `ModelBuffer-${this.name}`,
      size: 16 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.modelBindGroup = device.createBindGroup({
      label: `ModelBindGroup-${this.name}`,
      layout: StandardLayouts.modelBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.modelBuffer },
        },
      ],
    });
  }
}

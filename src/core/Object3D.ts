import { Transform } from "./Transform";
import type { Material } from "../graphics/Material";
import type { Mesh } from "../graphics/Mesh";

export class Object3D {
  name: string;
  transform = new Transform();
  mesh: Mesh | null = null;
  material: Material | null = null;

  // 1. 模型矩阵资源 (Group 1)
  modelBuffer: GPUBuffer | null = null;
  modelBindGroup: GPUBindGroup | null = null;

  constructor(name: string, mesh: Mesh, material: Material) {
    this.name = name;
    this.mesh = mesh;
    this.material = material;
  }
}

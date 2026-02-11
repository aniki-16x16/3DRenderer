import { Node3D } from "./Node3D";
import type { Camera } from "./Camera";
import { vec3, type Vec3 } from "wgpu-matrix";

export class Light extends Node3D {
  color: Vec3;
  intensity: number;
  shadowCamera: Camera | null = null;

  constructor(name: string, color: Vec3, intensity: number) {
    super(name);
    this.color = color;
    this.intensity = intensity;
  }

  syncShadowCamera() {
    if (this.shadowCamera) {
      vec3.copy(this.transform.position, this.shadowCamera.position);
    }
  }
}

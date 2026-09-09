import { lightLayout } from "../graphics/BufferLayouts";
import { Node3D } from "./Node3D";
import type { Camera } from "./Camera";
import { vec3, type Vec3 } from "wgpu-matrix";

export const LightTypeEnum = {
  Point: 0,
  Parallel: 1,
  Spot: 2,
} as const;
export type LightType = (typeof LightTypeEnum)[keyof typeof LightTypeEnum];

export class Light extends Node3D {
  color: Vec3;
  intensity: number;
  shadowCamera: Camera | null = null;

  static readonly DataSize = lightLayout.byteSize;

  protected type: LightType = LightTypeEnum.Point;

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

  packData(): ArrayBuffer {
    return lightLayout.create({ position: this.transform.positionRaw, light_type: this.type, color: this.color, intensity: this.intensity });
  }
}

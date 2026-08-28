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

  static DataSize = (4 + 4 + 4) * 4;

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
    const buffer = new ArrayBuffer(Light.DataSize);

    const floatView = new Float32Array(buffer, 0, 3);
    const uintView = new Uint32Array(buffer, 3 * 4, 1);
    floatView.set(this.transform.positionRaw);
    uintView.set([this.type]);
    const floatView2 = new Float32Array(buffer, 4 * 4, 4);
    floatView2.set([...this.color, this.intensity]);

    return buffer;
  }
}

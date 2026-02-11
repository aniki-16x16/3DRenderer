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

  /**
   * 数据布局 position(vec3f) + type(uint32) + direction(vec3f) + padding(uint32)
   * 共 4 + 4 = 8 个 float (32 bytes)
   */
  static DataSize = (4 + 4) * 4;

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

    return buffer;
  }
}

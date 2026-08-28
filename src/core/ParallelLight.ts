import { vec3 } from "wgpu-matrix";
import { Camera } from "./Camera";
import { Light, LightTypeEnum } from "./Light";

export class ParallelLight extends Light {
  protected type = LightTypeEnum.Parallel;
  target = vec3.create(0, 0, 0);

  constructor(color = [1, 1, 1], intensity = 1, name = "ParallelLight") {
    super(name, new Float32Array(color), intensity);
    this.shadowCamera = new Camera();
    this.shadowCamera.type = "orthographic";
    this.shadowCamera.far = 20;
  }

  override syncShadowCamera() {
    super.syncShadowCamera();
    vec3.copy(this.target, this.shadowCamera!.target);
  }

  override packData(): ArrayBuffer {
    const buffer = super.packData();

    const floatView = new Float32Array(buffer, 8 * 4, 3);
    floatView.set(
      vec3.normalize(vec3.subtract(this.target, this.transform.position)),
    );

    return buffer;
  }
}

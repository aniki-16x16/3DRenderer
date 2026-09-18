import { lightLayout } from "../renderer/layouts/BufferLayouts";
import { vec3 } from "wgpu-matrix";
import { Camera } from "./Camera";
import { Light, LightType } from "./Light";

export class DirectionalLight extends Light {
  protected type = LightType.Directional;
  target = vec3.create(0, 0, 0);

  constructor(color = [1, 1, 1], intensity = 1, name = "DirectionalLight") {
    super(name, new Float32Array(color), intensity);
    this.shadowCamera = new Camera();
    this.shadowCamera.type = "orthographic";
    this.shadowCamera.far = 20;
  }

  override syncShadowCamera() {
    super.syncShadowCamera();
    vec3.copy(this.target, this.shadowCamera!.target);
  }

  override packGpuData(): ArrayBuffer {
    const buffer = super.packGpuData();

    lightLayout.write(buffer, {
      direction: vec3.normalize(vec3.subtract(this.target, this.transform.position)),
    });

    return buffer;
  }
}

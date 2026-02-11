import { Camera } from "./Camera";
import { Light } from "./Light";

export class ParallelLight extends Light {
  constructor(color = [1, 1, 1], intensity = 1, name = "ParallelLight") {
    super(name, new Float32Array(color), intensity);
    this.shadowCamera = new Camera();
    this.shadowCamera.type = "orthographic";
    this.shadowCamera.far = 20;
  }
}

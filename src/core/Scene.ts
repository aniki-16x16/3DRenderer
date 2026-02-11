import { Object3D } from "./Object3D";
import { Camera } from "./Camera";
import { Light } from "./Light";

export class Scene {
  objects: Object3D[] = [];
  lights: Light[] = [];
  activeCamera: Camera | null = null;

  add(object: Object3D): Scene;
  add(light: Light): Scene;
  add(item: Object3D | Light): Scene {
    if (item instanceof Object3D) {
      this.objects.push(item);
    } else if (item instanceof Light) {
      this.lights.push(item);
    }
    return this;
  }

  remove(object: Object3D): Scene;
  remove(light: Light): Scene;
  remove(item: Object3D | Light): Scene {
    if (item instanceof Object3D) {
      this.objects = this.objects.filter((obj) => obj !== item);
    } else if (item instanceof Light) {
      this.lights = this.lights.filter((l) => l !== item);
    }
    return this;
  }
}

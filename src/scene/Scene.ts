import { Object3D } from "../core/Object3D";
import { Camera } from "./Camera";

export class Scene {
  objects: Object3D[] = [];
  activeCamera: Camera | null = null;

  add(object: Object3D) {
    this.objects.push(object);
  }

  remove(object: Object3D) {
    const index = this.objects.indexOf(object);
    if (index > -1) {
      this.objects.splice(index, 1);
    }
  }
}

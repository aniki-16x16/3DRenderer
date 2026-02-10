import { Object3D } from "./Object3D";
import { Camera } from "./Camera";
import type { ParallelLight } from "./ParallelLight";

export class Scene {
  objects: Object3D[] = [];
  activeCamera: Camera | null = null;
  activeLight: ParallelLight | null = null;

  add(object: Object3D) {
    this.objects.push(object);
    return this;
  }

  remove(object: Object3D) {
    const index = this.objects.indexOf(object);
    if (index > -1) {
      this.objects.splice(index, 1);
    }
    return this;
  }
}

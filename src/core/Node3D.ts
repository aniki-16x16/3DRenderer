import { Transform } from "./Transform";

export class Node3D {
  name: string;
  transform = new Transform();

  constructor(name: string) {
    this.name = name;
  }
}

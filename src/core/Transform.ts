import { mat4, vec3, type Vec3, type Mat4 } from "wgpu-matrix";

export class Transform {
  // 始终保留同一个 Proxy，避免整体赋值后绕过脏标记。
  private _position: Vec3;
  private _rotation: Vec3;
  private _scale: Vec3;

  // 缓存矩阵和脏标记
  private _modelMatrix: Mat4 = mat4.create();
  private _dirty: boolean = true;

  constructor() {
    this._position = this._makeReactive(vec3.create(0, 0, 0));
    this._rotation = this._makeReactive(vec3.create(0, 0, 0)); // Euler angles
    this._scale = this._makeReactive(vec3.create(1, 1, 1));
  }

  get position(): Vec3 {
    return this._position;
  }

  set position(value: Vec3) {
    vec3.copy(value, this._position);
  }

  get rotation(): Vec3 {
    return this._rotation;
  }

  set rotation(value: Vec3) {
    vec3.copy(value, this._rotation);
  }

  get scale(): Vec3 {
    return this._scale;
  }

  set scale(value: Vec3) {
    vec3.copy(value, this._scale);
  }

  private _makeReactive(target: Vec3): Vec3 {
    return new Proxy(target, {
      set: (target, prop, value, receiver) => {
        const result = Reflect.set(target, prop, value, receiver);
        if (result) {
          this._dirty = true;
        }
        return result;
      },
    });
  }

  updateMatrix() {
    if (!this._dirty) return;

    // 重置为单位矩阵
    mat4.identity(this._modelMatrix);
    mat4.translate(this._modelMatrix, this.position, this._modelMatrix);
    mat4.rotateX(this._modelMatrix, this.rotation[0], this._modelMatrix);
    mat4.rotateY(this._modelMatrix, this.rotation[1], this._modelMatrix);
    mat4.rotateZ(this._modelMatrix, this.rotation[2], this._modelMatrix);
    mat4.scale(this._modelMatrix, this.scale, this._modelMatrix);

    this._dirty = false;
  }

  getMatrix() {
    this.updateMatrix();
    return this._modelMatrix;
  }

  get positionRaw() {
    return vec3.create(this.position[0], this.position[1], this.position[2]);
  }
}

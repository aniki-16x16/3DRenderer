import { mat4, vec3, type Vec3, type Mat4 } from "wgpu-matrix";

export class Transform {
  // 使用 Proxy 包装内部状态
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

  get position() {
    return this._position;
  }
  get rotation() {
    return this._rotation;
  }
  get scale() {
    return this._scale;
  }

  updateMatrix() {
    if (!this._dirty) return;

    // 重置为单位矩阵
    mat4.identity(this._modelMatrix);
    mat4.translate(this._modelMatrix, this._position, this._modelMatrix);
    mat4.rotateX(this._modelMatrix, this._rotation[0], this._modelMatrix);
    mat4.rotateY(this._modelMatrix, this._rotation[1], this._modelMatrix);
    mat4.rotateZ(this._modelMatrix, this._rotation[2], this._modelMatrix);
    mat4.scale(this._modelMatrix, this._scale, this._modelMatrix);

    this._dirty = false;
  }

  getMatrix() {
    // 只有在脏的时候才更新
    this.updateMatrix();
    return this._modelMatrix;
  }
}

import { mat4, vec3, type Vec3, type Mat4 } from "wgpu-matrix";

export class Transform {
  // 使用私有变量存储状态
  private _position: Vec3 = vec3.create(0, 0, 0);
  private _rotation: Vec3 = vec3.create(0, 0, 0); // Euler angles
  private _scale: Vec3 = vec3.create(1, 1, 1);

  // 缓存矩阵和脏标记
  private _modelMatrix: Mat4 = mat4.create();
  private _dirty: boolean = true;

  // Position
  get position() {
    return this._position;
  }
  set position(v: Vec3) {
    vec3.copy(v, this._position);
    this._dirty = true;
  }

  // Rotation
  get rotation() {
    return this._rotation;
  }
  set rotation(v: Vec3) {
    vec3.copy(v, this._rotation);
    this._dirty = true;
  }

  // Scale
  get scale() {
    return this._scale;
  }
  set scale(v: Vec3) {
    vec3.copy(v, this._scale);
    this._dirty = true;
  }

  // 提供一些辅助方法，方便修改单个分量
  setPosition(x: number, y: number, z: number) {
    vec3.set(x, y, z, this._position);
    this._dirty = true;
    return this;
  }

  setRotation(x: number, y: number, z: number) {
    vec3.set(x, y, z, this._rotation);
    this._dirty = true;
    return this;
  }

  setScale(x: number, y: number, z: number) {
    vec3.set(x, y, z, this._scale);
    this._dirty = true;
    return this;
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

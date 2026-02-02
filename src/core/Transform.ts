import { mat4, vec3 } from "wgpu-matrix";

export class Transform {
  position = vec3.create(0, 0, 0);
  rotation = vec3.create(0, 0, 0); // Euler angles
  scale = vec3.create(1, 1, 1);

  // 缓存矩阵，避免每帧重复 new
  private _modelMatrix = mat4.create();

  updateMatrix() {
    // 重置为单位矩阵
    mat4.identity(this._modelMatrix);
    mat4.translate(this._modelMatrix, this.position, this._modelMatrix);
    mat4.rotateX(this._modelMatrix, this.rotation[0], this._modelMatrix);
    mat4.rotateY(this._modelMatrix, this.rotation[1], this._modelMatrix);
    mat4.rotateZ(this._modelMatrix, this.rotation[2], this._modelMatrix);
    mat4.scale(this._modelMatrix, this.scale, this._modelMatrix);
  }

  getMatrix() {
    return this._modelMatrix;
  }
}

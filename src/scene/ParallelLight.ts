import { mat4, vec3 } from "wgpu-matrix";

const SIZE = 5;

export class ParallelLight {
  position = vec3.create(0, 0, 0);
  target = vec3.create(0, 0, 0);
  up = vec3.create(0, 1, 0);

  private _projectionMatrix = mat4.create();
  private _viewMatrix = mat4.create();
  private _viewProjectionMatrix = mat4.create();

  updateMatrix() {
    mat4.identity(this._viewMatrix);
    mat4.lookAt(this.position, this.target, this.up, this._viewMatrix);
    mat4.identity(this._projectionMatrix);
    mat4.ortho(-SIZE, SIZE, -SIZE, SIZE, 0.5, 20, this._projectionMatrix);
    mat4.multiply(
      this._projectionMatrix,
      this._viewMatrix,
      this._viewProjectionMatrix,
    );
  }

  getViewMatrix() {
    return this._viewMatrix;
  }
  getProjectionMatrix() {
    return this._projectionMatrix;
  }
  getViewProjectionMatrix() {
    return this._viewProjectionMatrix;
  }
}

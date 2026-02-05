import { mat4, vec3 } from "wgpu-matrix";
import { angle2Rad } from "../utils/math";

export class Camera {
  position = vec3.create(0, 0, 0);
  target = vec3.create(0, 0, 0);
  up = vec3.create(0, 1, 0);

  private _projectionMatrix = mat4.create();
  private _viewMatrix = mat4.create();
  private _viewProjectionMatrix = mat4.create();

  fov: number = angle2Rad(45);
  aspect: number = 1.0;
  near: number = 0.1;
  far: number = 100.0;

  updateMatrix() {
    mat4.identity(this._viewMatrix);
    mat4.lookAt(this.position, this.target, this.up, this._viewMatrix);
    mat4.identity(this._projectionMatrix);
    mat4.perspective(
      this.fov,
      this.aspect,
      this.near,
      this.far,
      this._projectionMatrix,
    );
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

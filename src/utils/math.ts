import { mat4 } from "wgpu-matrix";

export function multiplyMatrices(
  matrices: Float32Array<ArrayBufferLike>[],
): Float32Array<ArrayBufferLike> {
  const result = mat4.create();
  mat4.identity(result);
  for (const matrix of matrices) {
    mat4.multiply(result, matrix, result);
  }
  return result;
}

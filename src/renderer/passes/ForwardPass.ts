import type { Object3D } from "../../scene/Object3D";
import { drawObjects } from "../drawObjects";

/** 主场景 Pass 没有自有 GPU 资源，附件和绑定由调用者提供。 */
export function encodeForwardPass(
  encoder: GPUCommandEncoder,
  objects: readonly Object3D[],
  sceneBindings: GPUBindGroup,
  color: GPUTextureView,
  depth: GPUTextureView,
): void {
  const pass = encoder.beginRenderPass({
    label: "ForwardPass",
    colorAttachments: [
      { view: color, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
    ],
    depthStencilAttachment: {
      view: depth,
      depthClearValue: 1,
      depthLoadOp: "clear",
      depthStoreOp: "store",
    },
  });
  pass.setBindGroup(0, sceneBindings);
  drawObjects(pass, objects);
  pass.end();
}

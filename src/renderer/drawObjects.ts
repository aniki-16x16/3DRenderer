import type { Material } from "../materials/Material";
import type { Object3D } from "../scene/Object3D";
import { VertexBufferSlot } from "./layouts/VertexLayouts";

/** 仅编码绘制命令；模型与材质数据在逐帧准备阶段上传。 */
export function drawObjects(
  pass: GPURenderPassEncoder,
  objects: readonly Object3D[],
  overrideMaterial?: Material,
): void {
  let currentPipeline: GPURenderPipeline | null = null;
  let currentMaterialGroup: GPUBindGroup | null = null;
  for (const object of objects) {
    const { mesh } = object;
    const material = overrideMaterial ?? object.material;
    if (!mesh?.vertexBuffer || !material?.pipeline || !object.modelBindGroup) continue;
    if (currentPipeline !== material.pipeline) {
      pass.setPipeline(material.pipeline);
      currentPipeline = material.pipeline;
    }
    if (material.bindGroup && currentMaterialGroup !== material.bindGroup) {
      pass.setBindGroup(1, material.bindGroup);
      currentMaterialGroup = material.bindGroup;
    }
    pass.setBindGroup(2, object.modelBindGroup);
    pass.setVertexBuffer(VertexBufferSlot.Position, mesh.vertexBuffer);
    if (mesh.normalBuffer) pass.setVertexBuffer(VertexBufferSlot.Normal, mesh.normalBuffer);
    if (mesh.uvBuffer) pass.setVertexBuffer(VertexBufferSlot.UV, mesh.uvBuffer);
    if (mesh.tangentBuffer) pass.setVertexBuffer(VertexBufferSlot.Tangent, mesh.tangentBuffer);
    if (mesh.indexBuffer) {
      pass.setIndexBuffer(mesh.indexBuffer, mesh.indexFormat!);
      pass.drawIndexed(mesh.indexCount, 1, 0, 0, 0);
    } else {
      pass.draw(mesh.vertexCount, 1, 0, 0);
    }
  }
}

export function sortObjectsByMaterial(objects: readonly Object3D[]): Object3D[] {
  return [...objects].sort((a, b) => {
    if (!a.material || !b.material) return 0;
    if (a.material.kind === b.material.kind) return a.material.id - b.material.id;
    return a.material.kind < b.material.kind ? -1 : 1;
  });
}

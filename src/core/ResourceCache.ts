export class ResourceCache {
  private bindGroupLayouts: Map<string, GPUBindGroupLayout> = new Map();
  getBindGroupLayout(
    key: string,
    subType?: string,
  ): GPUBindGroupLayout | undefined {
    return this.bindGroupLayouts.get(getFinalKey(key, subType));
  }
  setBindGroupLayout(
    key: string,
    layout: GPUBindGroupLayout,
    subType?: string,
  ): void {
    this.bindGroupLayouts.set(getFinalKey(key, subType), layout);
  }

  private pipelineLayouts: Map<string, GPUPipelineLayout> = new Map();
  getPipelineLayout(
    key: string,
    subType?: string,
  ): GPUPipelineLayout | undefined {
    return this.pipelineLayouts.get(getFinalKey(key, subType));
  }
  setPipelineLayout(
    key: string,
    layout: GPUPipelineLayout,
    subType?: string,
  ): void {
    this.pipelineLayouts.set(getFinalKey(key, subType), layout);
  }

  private renderPipelines: Map<string, GPURenderPipeline> = new Map();
  getRenderPipeline(
    key: string,
    subType?: string,
  ): GPURenderPipeline | undefined {
    return this.renderPipelines.get(getFinalKey(key, subType));
  }
  setRenderPipeline(
    key: string,
    pipeline: GPURenderPipeline,
    subType?: string,
  ): void {
    this.renderPipelines.set(getFinalKey(key, subType), pipeline);
  }
}
export const globalResourceCache = new ResourceCache();

function getFinalKey(key: string, subType?: string): string {
  return `${key}${subType ?? ""}`;
}

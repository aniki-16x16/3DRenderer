export class ResourceCache {
  private bindGroupLayouts: Map<string, GPUBindGroupLayout> = new Map();
  getBindGroupLayout(key: string): GPUBindGroupLayout | undefined {
    return this.bindGroupLayouts.get(key);
  }
  setBindGroupLayout(key: string, layout: GPUBindGroupLayout): void {
    this.bindGroupLayouts.set(key, layout);
  }

  private pipelineLayouts: Map<string, GPUPipelineLayout> = new Map();
  getPipelineLayout(key: string): GPUPipelineLayout | undefined {
    return this.pipelineLayouts.get(key);
  }
  setPipelineLayout(key: string, layout: GPUPipelineLayout): void {
    this.pipelineLayouts.set(key, layout);
  }

  private renderPipelines: Map<string, GPURenderPipeline> = new Map();
  getRenderPipeline(key: string): GPURenderPipeline | undefined {
    return this.renderPipelines.get(key);
  }
  setRenderPipeline(key: string, pipeline: GPURenderPipeline): void {
    this.renderPipelines.set(key, pipeline);
  }
}
export const globalResourceCache = new ResourceCache();

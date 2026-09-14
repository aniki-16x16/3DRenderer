import { exposureLayout } from "./BufferLayouts";
import type { Shader } from "./Shader";

export class Output2Canvas {
  label: string;
  bindGroupLayout: GPUBindGroupLayout | null = null;
  bindGroup: GPUBindGroup | null = null;
  pipeline: GPURenderPipeline | null = null;
  exposureBuffer: GPUBuffer | null = null;
  exposureData = new Float32Array(1);

  constructor(label = "Output2Canvas") {
    this.label = label;
  }

  initialize(device: GPUDevice, format: GPUTextureFormat, shader: Shader) {
    this.exposureBuffer = device.createBuffer({
      label: "ExposureBuffer",
      size: exposureLayout.byteSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroupLayout = device.createBindGroupLayout({
      label: `${this.label}-bind-group-layout`,
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: "float",
            multisampled: false,
            viewDimension: "2d",
          },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({
      label: `${this.label}-pipeline-layout`,
      bindGroupLayouts: [this.bindGroupLayout],
    });
    this.pipeline = device.createRenderPipeline({
      label: this.label,
      layout: pipelineLayout,
      vertex: {
        module: shader.module,
        entryPoint: "vs_main",
      },
      fragment: {
        module: shader.module,
        entryPoint: "fs_main",
        targets: [
          {
            format,
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "none",
      },
    });
  }

  setInput(device: GPUDevice, hdrColor: GPUTextureView) {
    this.bindGroup = device.createBindGroup({
      label: `${this.label}-bind-group`,
      layout: this.bindGroupLayout!,
      entries: [
        {
          binding: 0,
          resource: hdrColor,
        },
        {
          binding: 1,
          resource: {
            buffer: this.exposureBuffer!,
          },
        },
      ],
    });
  }

  setExposure(device: GPUDevice, exposure: number) {
    this.exposureData[0] = exposure;
    device.queue.writeBuffer(this.exposureBuffer!, 0, this.exposureData);
  }

  destroy() {
    this.exposureBuffer?.destroy();
    this.exposureBuffer = null;
    this.bindGroupLayout = null;
    this.bindGroup = null;
    this.pipeline = null;
  }
}

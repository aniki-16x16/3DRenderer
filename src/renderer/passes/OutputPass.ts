import { resourceLabel } from "../../gpu/ResourceLabels";
import { exposureLayout } from "../layouts/BufferLayouts";
import { Shader } from "../../gpu/Shader";
import shaderSource from "./output.wgsl?raw";
import { UniformSync } from "../../gpu/UniformSync";
import type { OutputSettings } from "../../scene/OutputSettings";

export class OutputPass {
  label: string;
  private device: GPUDevice | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private inputView: GPUTextureView | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private exposureBuffer: GPUBuffer | null = null;
  private readonly uniformSync = new UniformSync(exposureLayout.byteSize);

  protected resourceLabel(role: string): string {
    return resourceLabel(this.label, role);
  }

  constructor(label = "OutputPass") {
    this.label = label;
  }

  initialize(device: GPUDevice, format: GPUTextureFormat) {
    if (this.device) throw new Error("Output is already initialized");
    this.device = device;
    const shader = new Shader(device, this.label, shaderSource);
    this.exposureBuffer = device.createBuffer({
      label: this.resourceLabel("exposure-buffer"),
      size: exposureLayout.byteSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroupLayout = device.createBindGroupLayout({
      label: this.resourceLabel("bind-group-layout"),
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
      label: this.resourceLabel("pipeline-layout"),
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

  setInput(hdrColor: GPUTextureView) {
    const device = this.requireDevice();
    if (this.inputView === hdrColor) return;
    this.bindGroup = device.createBindGroup({
      label: this.resourceLabel("bind-group"),
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
    this.inputView = hdrColor;
  }

  private requireDevice(): GPUDevice {
    if (!this.device) throw new Error("Output is not initialized or has been destroyed");
    return this.device;
  }

  /** 调用方只提供目标，输出绑定由本对象管理。 */
  encode(encoder: GPUCommandEncoder, target: GPUTextureView, settings: Readonly<OutputSettings>) {
    const device = this.requireDevice();
    if (!this.pipeline || !this.bindGroup) throw new Error("Set output input before rendering");
    exposureLayout.write(this.uniformSync.data, { exposure: settings.exposure });
    this.uniformSync.upload(device, this.exposureBuffer!);
    const pass = encoder.beginRenderPass({
      label: this.resourceLabel("pass"),
      colorAttachments: [
        {
          view: target,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setBindGroup(0, this.bindGroup);
    pass.setPipeline(this.pipeline);
    pass.draw(3);
    pass.end();
  }

  destroy() {
    this.device = null;
    this.exposureBuffer?.destroy();
    this.exposureBuffer = null;
    this.uniformSync.reset();
    this.bindGroupLayout = null;
    this.bindGroup = null;
    this.inputView = null;
    this.pipeline = null;
  }
}

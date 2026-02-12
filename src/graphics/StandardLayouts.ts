export class StandardLayouts {
  // Group 0: Frame / Camera
  static cameraBindGroupLayout: GPUBindGroupLayout;

  // Group 2: Model / Object
  static modelBindGroupLayout: GPUBindGroupLayout;

  static shadowPassBindGroupLayout: GPUBindGroupLayout;

  static initialize(device: GPUDevice) {
    // 1. Group 0: Camera (ViewProjection + Position)
    this.cameraBindGroupLayout = device.createBindGroupLayout({
      label: "standard-camera-bind-group-layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: "depth",
            viewDimension: "2d",
            multisampled: false,
          },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "comparison" },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    // 2. Group 2: Model (ModelMatrix)
    this.modelBindGroupLayout = device.createBindGroupLayout({
      label: "standard-model-bind-group-layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });

    // 3. Group 0: Shadow Pass
    this.shadowPassBindGroupLayout = device.createBindGroupLayout({
      label: "standard-shadow-pass-bind-group-layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform" },
        },
      ],
    });
  }
}

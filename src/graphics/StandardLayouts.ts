export class StandardLayouts {
  // Group 0: Frame / Camera
  static cameraBindGroupLayout: GPUBindGroupLayout;

  // Group 2: Model / Object
  static modelBindGroupLayout: GPUBindGroupLayout;

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
  }
}

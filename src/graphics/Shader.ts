export class Shader {
  module: GPUShaderModule;
  label: string;

  constructor(device: GPUDevice, label: string, code: string) {
    this.label = label;
    this.module = device.createShaderModule({
      label: label,
      code: code,
    });
  }
}

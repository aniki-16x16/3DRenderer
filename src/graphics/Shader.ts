export class Shader {
  private static idCounter = 1;

  readonly ID: number;
  module: GPUShaderModule;
  label: string;

  constructor(device: GPUDevice, label: string, code: string) {
    this.ID = Shader.idCounter++;
    this.label = label;
    this.module = device.createShaderModule({
      label: label,
      code: code,
    });
  }
}

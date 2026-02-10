import { Texture } from "../graphics/Texture";

export const normalTexture = new Texture("NormalTexture");
export function initializeNormalTexture(device: GPUDevice) {
  // 创建一个纯蓝色的纹理，表示默认法线指向正Z轴
  normalTexture.initialize(device, [128, 128, 255, 255]);
}

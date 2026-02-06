import { Texture } from "../graphics/Texture";

export const whiteTexture = new Texture("WhiteTexture");
export function initializeWhiteTexture(device: GPUDevice) {
  whiteTexture.initialize(device, [255, 255, 255, 255]);
}

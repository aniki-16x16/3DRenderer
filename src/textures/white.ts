import { Texture } from "../graphics/Texture";

export const whiteTexture = new Texture("WhiteTexture", {
  colorSpace: "srgb",
});
export function initializeWhiteTexture(device: GPUDevice) {
  whiteTexture.initialize(device, [255, 255, 255, 255]);
}

import { Texture } from "../graphics/Texture";
const textures = new WeakMap<GPUDevice, Texture>();
export function getWhiteTexture(device: GPUDevice): Texture {
  let texture = textures.get(device);
  if (!texture) { texture = new Texture("white", { colorSpace: "srgb" }); textures.set(device, texture); }
  if (!texture.view) texture.initialize(device, [255, 255, 255, 255]);
  return texture;
}

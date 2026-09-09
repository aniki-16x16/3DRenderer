import { Texture } from "../graphics/Texture";
const textures = new WeakMap<GPUDevice, Texture>();
export function getNormalTexture(device: GPUDevice): Texture {
  let texture = textures.get(device);
  if (!texture) { texture = new Texture("normal", { colorSpace: "linear" }); textures.set(device, texture); }
  if (!texture.view) texture.initialize(device, [128, 128, 255, 255]);
  return texture;
}

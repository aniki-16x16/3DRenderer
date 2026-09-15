/** 只负责下载、解码；调用者负责关闭返回的 ImageBitmap。 */
export async function loadImage(url: string, signal?: AbortSignal): Promise<ImageBitmap> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Failed to load image: ${url} (${response.status})`);
  const blob = await response.blob();
  signal?.throwIfAborted();
  const image = await createImageBitmap(blob);
  if (signal?.aborted) {
    image.close();
    signal.throwIfAborted();
  }
  return image;
}

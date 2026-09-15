const samplers = new WeakMap<GPUDevice, { linear: GPUSampler; comparison: GPUSampler }>();
export function getSamplers(device: GPUDevice) {
  let cached = samplers.get(device);
  if (!cached) {
    cached = {
      linear: device.createSampler({
        label: "LinearSampler",
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "repeat",
        addressModeV: "repeat",
      }),
      comparison: device.createSampler({
        label: "ComparisonSampler",
        compare: "less",
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "repeat",
        addressModeV: "repeat",
      }),
    };
    samplers.set(device, cached);
  }
  return cached;
}

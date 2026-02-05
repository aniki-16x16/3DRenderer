export function createRepeatNormals(
  normal: number[],
  repeatCount: number,
): number[] {
  const repeatedNormals: number[] = [];
  for (let i = 0; i < repeatCount; i++) {
    repeatedNormals.push(...normal);
  }
  return repeatedNormals;
}

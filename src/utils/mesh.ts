export function createRepeatData(
  data: number[],
  repeatCount: number,
): number[] {
  const repeatedData: number[] = [];
  for (let i = 0; i < repeatCount; i++) {
    repeatedData.push(...data);
  }
  return repeatedData;
}

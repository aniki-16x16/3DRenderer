/** 统一调试名称；不参与缓存键或资源所有权。 */
export function resourceLabel(owner: string, role: string): string {
  return `${owner}-${role}`;
}

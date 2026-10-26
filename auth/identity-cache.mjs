export function scopeIdentityCache(state, appId, empty) {
  if (!appId || state.appId === appId) return null;
  if (Object.values(state.operations || {}).some(op => op.status !== 'success')) {
    const message = '应用已变更，但仍有未同步任务。请先使用原应用完成或核对任务，禁止将旧人员标识直接写入新应用。';
    throw Object.assign(new Error(message), { status:409, publicMessage:message });
  }
  return { ...structuredClone(state), ...structuredClone(empty), appId };
}

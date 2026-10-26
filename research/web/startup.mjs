export async function loadWorkspace({ projects, read, onSnapshot }) {
  const snapshots = Promise.all(projects.map(async project => {
    const result = await read('/api/research', project.key);
    if (result.data && result.data.project?.key !== project.key) throw Error('项目数据来源不匹配，请重试。');
    return result;
  }));
  const jobs = Promise.allSettled(projects.map(project => read('/api/research/operations', project.key)));
  const results = await snapshots;
  onSnapshot(results);
  const operations = await jobs;
  const failure = operations.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  return results.map((result, index) => ({ result, jobs: operations[index].value }));
}

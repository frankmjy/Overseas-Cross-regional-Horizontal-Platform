export async function loadWorkspace({ projects, read, onSnapshot }) {
  const snapshots = Promise.allSettled(projects.map(project=>read('/api/research',project.key)));
  const jobs = Promise.allSettled(projects.map(project => read('/api/research/operations', project.key)));
  const reads=await snapshots;
  const results=reads.map(result=>result.status==='fulfilled'?result.value:{state:'error',error:result.reason.message});
  if(results.some((result,i)=>result.data&&result.data.project?.key!==projects[i].key))throw Error('项目数据来源不匹配，请重试。');
  if(reads.every(result=>result.status==='rejected'))throw reads[0].reason;
  onSnapshot(results);
  const operations = await jobs;
  const failure = operations.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  const updates=await Promise.all(results.map(async(result,index)=>{
    const data=result.data;if(!data)return result;
    const jobs=new Map((operations[index].value.operations||[]).map(op=>[op.id,op.status]));
    const syncs=[...['questions','deletedQuestions','findings','evidence'].flatMap(key=>(data[key]||[]).map(row=>row.sync)),...Object.values(data.topicSync||{})].filter(Boolean);
    if(!syncs.some(sync=>jobs.has(sync.operationId)&&jobs.get(sync.operationId)!==sync.status))return result;
    const latest=await read('/api/research',projects[index].key);
    if(latest.data&&latest.data.project?.key!==projects[index].key)throw Error('项目数据来源不匹配，请重试。');
    return latest;
  }));
  if(updates.some((result,index)=>result!==results[index])){results.splice(0,results.length,...updates);onSnapshot(results);}
  return results.map((result, index) => ({ result, jobs: operations[index].value }));
}

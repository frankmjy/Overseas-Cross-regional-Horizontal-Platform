export function nextChildCode(parent,records=[],operations=[]){
 const prefix=(parent.sourceCode||parent.code)+'-';let last=0;
 for(const row of [...records,...operations.filter(o=>o.kind==='create')]){
  const code=String(row.sourceCode||row.code||'');if(!code.startsWith(prefix))continue;
  const suffix=code.slice(prefix.length);if(!/^\d+$/.test(suffix))continue;
  const value=Number(suffix);if(Number.isSafeInteger(value))last=Math.max(last,value);
 }
 if(!Number.isSafeInteger(last+1))throw Error('任务编号已超过范围，请核对。');
 return prefix+String(last+1).padStart(2,'0');
}

import assert from 'node:assert/strict';
const my=new Set([1,3,5,6,7,9,10,12,13,15,19,23,26,29,36,37,38,39,40,41,42,46,49,50]);
const common=new Set([17,18,22,25,34,43,44,48,51]);
export const text=value=>Array.isArray(value)?text(value[0]):value==null?'':typeof value==='object'?value.text||value.name||'':String(value);
export const url=value=>/^\[.*\]\((https?:\/\/.*)\)$/.exec(text(value))?.[1]||text(value);
export function classifyFinding(f){
 const qid=text(f.明细编号).split(':')[0],n=Number(qid.slice(2)),content=text(f.调研内容),proof=text(f.举证原文);
 if(!content&&!proof)return{kind:'empty',parts:{},reason:'原明细为空，保留两国待调研条目。'};
 if(n===2||n===4){
  const markers=[...content.matchAll(/(?:^|\n)(泰国|马来)(?:[:：]|\n)/g)];assert(markers.length,`Country headings missing ${f.明细编号}`);
  const parts={};for(let i=0;i<markers.length;i++){const m=markers[i],project=m[1]==='泰国'?'thailand':'malaysia';parts[project]={content:content.slice(m.index,i+1<markers.length?markers[i+1].index:undefined),proof};}
  assert.equal(Object.values(parts).map(p=>p.content).join('').replace(/\s/g,''),content.replace(/\s/g,''),'Country split lost text');
  return{kind:markers.length>1?'split':'country',parts,reason:n===2?'招聘渠道按原文明示的国家标题分段。':'薪资档次按泰国与马来原文分段，保留联合报告引用。'};
 }
 if(my.has(n)||n===30&&text(f.调研对象)==='中联云港')return{kind:'country',parts:{malaysia:{content,proof}},reason:'马来友商访谈、园区、人员或属地现场资料；同组园区介绍、币种、资质及文件提供上下文，不扩展为泰国现场事实。'};
 if(common.has(n)||n===30&&text(f.调研对象)==='万国数据')return{kind:'common',parts:{thailand:{content,proof},malaysia:{content,proof}},reason:'可复用的渠道、培养流程、语言能力、测试或调研资料；保持友商来源，不作为现场执行完成情况。'};
 throw Error(`Unreviewed nonempty finding: ${f.明细编号}`);
}

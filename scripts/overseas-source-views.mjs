const names={
  '内容':'Content（内容）','表格':'Grid（表格）','目录':'Directory（目录）',
  '汇总':'Overview（汇总）','总览':'Overview（总览）','经验库总表':'Experience Library（经验库总表）',
  'PUE考核机制':'PUE Assessment（PUE考核机制）','机房网络保证':'Network Availability（机房网络保证）',
  '机房电力保证':'Power Availability（机房电力保证）','机房环境保证（风冷）':'Air Cooling（机房环境保证：风冷）',
  '机房环境保证（液冷）':'Liquid Cooling（机房环境保证：液冷）',
  '运维服务标准':'Operations Standards（运维服务标准）','其他服务标准':'Other Standards（其他服务标准）',
  '2026年月报':'2026 Monthly Reviews（2026年月报）','2025年月报':'2025 Monthly Reviews（2025年月报）',
  '基础设施':'Infrastructure（基础设施）','日常运维':'Routine Operations（日常运维）','物理安防':'Physical Security（物理安防）',
  '统计表':'Statistics（统计表）','甘特图':'Gantt（甘特图）','测试人员池':'Personnel Pool（测试人员池）',
  '电气':'Electrical（电气）','暖通':'HVAC（暖通）','弱电':'ELV（弱电）','消防':'Fire Safety（消防）',
  'EHS':'EHS（安全健康环境）','体系':'Management Systems（体系）','其他':'Other（其他）',
};
export function mappedView(group,sourceTable,view,index){
  const mapping=new Map(group.mappings.filter(m=>m.table===sourceTable.id).map(m=>[m.sourceName,m.targetName]));
  const field=value=>{
    const name=sourceTable.fields.find(f=>f.id===value)?.name||value;
    if(!mapping.has(name))throw Error(`unmapped source view field: ${sourceTable.name} ${name}`);
    return mapping.get(name);
  };
  let name=names[view.name];
  if(group.sources.length>1){
    const number=String(index+1).padStart(2,'0');
    name=`Source Template ${number} · ${view.name}（源模板${number}·${view.name}）`;
  }else if(group.key==='inspection'&&/202[56]/.test(view.name)){
    const year=view.name.match(/202[56]/)[0];
    name=`Source Review ${String(index).padStart(2,'0')} · ${year}（源检查${String(index).padStart(2,'0')}·${year}）`;
  }
  if(!name)throw Error(`missing bilingual view name: ${view.name}`);
  const filter={logic:view.filter?.logic||'and',conditions:(view.filter?.conditions||[]).map(([f,op,value])=>value===null||value===undefined?[field(f),op]:[field(f),op,value])};
  if(group.sources.length>1){
    if(filter.logic!=='and'&&filter.conditions.length)throw Error('source OR filter requires nested intersection before merging tables');
    filter.conditions.push(['Source Table（来源表）','==',sourceTable.name]);
  }
  let visible=(view.visible||[]).map(field);
  // Attachment files stay in the source; put the approved source-file index in the same column position.
  visible=visible.map(n=>group.fields.find(f=>f.name===n)?.type==='attachment'?'Source Files（源附件清单）':n);
  visible=[...new Set([...visible,'Applicable Project（适用项目）','Source Table（来源表）','Source Record（原记录链接）'])];
  return {name,type:view.type,sourceTable:sourceTable.id,sourceView:view.id,filter,visible,
    group:(view.group||[]).map(g=>({...g,field:field(g.field)})),
    sort:(view.sort||[]).map(s=>({...s,field:field(s.field)})),
    ...(view.timebar?{timebar:Object.fromEntries(Object.entries(view.timebar).map(([k,v])=>[k,field(v)]))}:{}),
    reuseOverview:group.sources.length===1&&index===0&&view.type==='grid'&&!filter.conditions.length};
}

export function normalizedCell(value,field){
  if(value===undefined||value===null||value==='')return null;
  if(field.type==='select')return [...(Array.isArray(value)?value:[value])].sort();
  if(['user','group_chat'].includes(field.type))return value.map(v=>v.id).sort();
  if(field.type==='datetime')return Date.parse(value.includes('T')?value:value.replace(' ','T')+'+08:00');
  if(field.style?.type==='url'&&typeof value==='string')return /^\[.*\]\((.*)\)$/.exec(value)?.[1]||value;
  return value;
}

export function dataGaps(group,expected,actual){
  const key='Source Record Key（源记录标识）',index=new Map(actual.map(r=>[r.cells[key],r]));
  if(index.size!==actual.length)throw Error(`duplicate source keys: ${group.key}`);
  const issues=[];let checked=0;
  for(const row of expected){
    const target=index.get(row[key]);
    if(!target){issues.push({key:row[key],kind:'missing-record'});continue}
    for(const field of group.fields){
      if(field.type==='attachment'||field.name==='Applicable Project（适用项目）')continue;
      checked++;
      const want=normalizedCell(row[field.name],field),got=normalizedCell(target.cells[field.name],field);
      if(JSON.stringify(want)!==JSON.stringify(got))issues.push({key:row[key],record:target.id,field:field.name,kind:got===null&&want!==null?'missing-cell':'different-cell',expected:want,actual:got});
    }
  }
  const expectedKeys=new Set(expected.map(r=>r[key]));
  for(const r of actual)if(!expectedKeys.has(r.cells[key]))issues.push({key:r.cells[key],kind:'unexpected-record'});
  return {key:group.key,rows:expected.length,checked,issues};
}

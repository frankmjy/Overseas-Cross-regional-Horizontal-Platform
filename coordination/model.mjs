export const materialFields=[
 ['sequence','序号','number','基本信息'],['capacity','兆瓦数（项目填写）','number','配置参数'],['buildingCount','园区楼栋数量（项目填写）','number','配置参数'],
 ['primary','一级分类','select','基本信息'],['category','二级分类','select','基本信息'],['specialty','专业','select','基本信息'],['name','名称','text','基本信息'],['brand','参考品牌','text','基本信息'],['model','参考型号','text','基本信息'],
 ['region','适用区域','select','基本信息'],['architecture','适用架构','select','基本信息'],['requirement','配置说明','select','配置参数'],['unitPrice','参考单价','number','金额与实际数量'],
 ['level','配置方式','select','配置参数'],['buildingQuantity','楼栋','number','配置参数'],['campusQuantity','园区','number','配置参数'],['cityQuantity','城市单体','number','配置参数'],['unit','单位','text','基本信息'],
 ['guidance','配置数量参考方式说明','multi','配置参数'],['listCategory','清单类别','select','基本信息'],['referenceAmount','参考数量价格','number','金额与实际数量'],['totalReferenceAmount','物资总价','number','金额与实际数量'],
 ['modification','是否修改','text','金额与实际数量'],['actualBuildingQuantity','楼栋（实际数量）','number','金额与实际数量'],['actualCampusQuantity','园区（实际数量）','number','金额与实际数量'],['actualAmount','实际数量价格','number','金额与实际数量'],['totalActualAmount','实际物资总价','number','金额与实际数量']
].map(([key,label,type,group])=>({key,label,type,group}));

function number(value){if(value===null||value===undefined||value==='')return null;if((typeof value!=='number'&&typeof value!=='string')||!String(value).trim()||!Number.isFinite(Number(value)))throw Error('物资数字字段无效。');return Number(value);}
function text(value){if(value==null)return '';if(typeof value!=='string')throw Error('物资文本字段无效。');return value;}
export function projectMaterial({id,cells}){
 if(typeof id!=='string'||!id||!cells||typeof cells!=='object')throw Error('物资记录格式无效。');
 const r={id};for(const f of materialFields){const v=cells[f.key];if(f.type==='number')r[f.key]=number(v);else if(f.type==='multi'||f.type==='select'){
  const a=v==null?[]:Array.isArray(v)?v:[v];if(a.some(x=>typeof x!=='string'))throw Error('物资选项字段无效。');if(f.type==='select'&&a.length>1)throw Error('物资单选字段无效。');r[f.key]=f.type==='multi'?[...a]:a[0]||'';
 }else r[f.key]=text(v);}return r;
}
export function groups(records,key){const map=new Map();for(const r of records){const value=r[key]||'__empty__';map.set(value,(map.get(value)||0)+1);}return [...map].map(([id,count])=>({id,name:id==='__empty__'?'未分类':id,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'zh-CN'));}
export function summarizeMaterials(records){
 const amounts=records.map(r=>r.referenceAmount).filter(v=>v!==null&&v!==undefined);
 return {total:records.length,named:records.filter(r=>r.name?.trim()).length,unnamed:records.filter(r=>!r.name?.trim()).length,required:records.filter(r=>r.requirement==='必配').length,optional:records.filter(r=>r.requirement==='选配').length,unknownRequirement:records.filter(r=>!r.requirement).length,referenceAmount:amounts.length?amounts.reduce((a,b)=>a+b,0):null,categories:groups(records,'category'),primary:groups(records,'primary'),levels:groups(records,'level')};
}
export function filterMaterials(records,state={}){
 const query=(state.q||'').trim().toLocaleLowerCase();const result=records.filter(r=>['primary','category','specialty','requirement','region','architecture','level'].every(k=>!state[k]||(r[k]||'__empty__')===state[k])&&(!query||[r.sequence,r.name,r.brand,r.model,...r.guidance].join(' ').toLocaleLowerCase().includes(query)));
 return result.sort((a,b)=>state.sort==='amount-desc'?(b.referenceAmount??-Infinity)-(a.referenceAmount??-Infinity)||(a.sequence??Infinity)-(b.sequence??Infinity):state.sort==='name'?a.name.localeCompare(b.name,'zh-CN'):(a.sequence??Infinity)-(b.sequence??Infinity)||a.id.localeCompare(b.id));
}
export function pageMaterials(rows,page=1,size=20){const pages=Math.max(1,Math.ceil(rows.length/size)),current=Math.min(pages,Math.max(1,Math.floor(Number(page))||1));return {rows:rows.slice((current-1)*size,current*size),page:current,pages,total:rows.length};}

export function materialListView(rows,state={},orders={},collapsed=new Set()){
 const keys={category:['category'],classification:['primary','category'],specialty:['specialty'],'specialty-category':['specialty','category'],level:['level'],region:['region'],none:[]},group=Object.hasOwn(keys,state.group)?state.group:'category',size=[50,100,200].includes(Number(state.pageSize))?Number(state.pageSize):50;
 const defaults={primary:['资产','低耗'],category:['仪器仪表','运维工具','安全工具','安全工具\n-消防','应急工具','办公物资'],specialty:['电气','暖通','消防','弱电','通用','待确认'],level:['楼栋','园区','城市单体']};
 function tree(items,depth=0,parent=[]){const key=keys[group][depth];if(!key)return [];const map=new Map();for(const row of items){const value=row[key]||'';if(!map.has(value))map.set(value,[]);map.get(value).push(row);}const order=orders[key]||defaults[key]||[];const rank=v=>v?order.includes(v)?order.indexOf(v):order.length:Infinity;
  return [...map].sort(([a],[b])=>rank(a)-rank(b)||a.localeCompare(b,'zh-CN')).map(([value,records])=>{const id=JSON.stringify([...parent,key,value]);return {id,key,value,total:records.length,rows:records,children:tree(records,depth+1,[...parent,key,value])};});
 }
 const complete=tree(rows),ordered=[];
 function flatten(groups){for(const g of groups){g.start=ordered.length;if(!collapsed.has(g.id)){if(g.children.length)flatten(g.children);else ordered.push(...g.rows);}g.end=ordered.length;}}
 if(complete.length)flatten(complete);else ordered.push(...rows);
 const page=pageMaterials(ordered,state.page,size),start=(page.page-1)*size,end=start+page.rows.length,ids=new Set(page.rows.map(r=>r.id));
 const onPage=g=>ordered.length===0||g.start>=start&&(g.start<end||g.start===ordered.length&&page.page===page.pages);
 function prune(groups){return groups.flatMap(g=>{
  if(collapsed.has(g.id))return onPage(g)?[{...g,rows:[],children:[]}]:[];
  const children=prune(g.children),visibleRows=g.children.length?[]:g.rows.filter(r=>ids.has(r.id));
  return children.length||visibleRows.length?[{...g,rows:visibleRows,children}]:[];
 });}
 return {...page,total:rows.length,visibleTotal:ordered.length,size,group,groups:prune(complete),groupIds:(function collect(groups){return groups.flatMap(g=>[g.id,...collect(g.children)]);})(complete)};
}

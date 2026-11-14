import {handoverStages,operationsCategories,documentLifecycle} from './lifecycle.mjs';
import {regionalOfficeSections} from './library-model.mjs';

const preparationStage='handover:1';
const preparationTopics=[
 {key:'factory-inspection',name:'设备厂验',title:/设备厂验|出厂验收|\bFAT\b/i},
 {key:'equipment-specifications',name:'设备技术规格',nature:'设备技术规格'},
 {key:'maintenance-standards',name:'维保规范',nature:'运维维保需求规范'},
 {key:'drawing-review',name:'施工图及图审记录',title:/施工图|图纸审图|图审记录|审图意见/},
 {key:'procurement',name:'招采与技术澄清',nature:'招采',title:/招标文件|技术澄清/},
 {key:'staffing',name:'团队组建与配置',title:/团队组建|人力配置|岗位.{0,6}(?:需求|缺口)|到岗与后备缺口|招募|面试/},
 {key:'operations-requirements',name:'运维需求与方案',title:/运维需求|运维方案/},
];
const preparationDirectory=preparationTopics.map(({key,name})=>({id:'prep:'+key,name,chapter:'handover',parentId:preparationStage,project:'shared',stage:'1',builtin:true}));
export function isPreparationDirectory(id){return preparationDirectory.some(node=>node.id===id);}
export function preparationNature(id){return preparationTopics.find(topic=>'prep:'+topic.key===id)?.nature||'';}

export const builtinDirectory=Object.freeze([
 ...handoverStages.map(s=>({id:'handover:'+s.step,name:s.name,chapter:'handover',parentId:'',project:'shared',stage:s.step,builtin:true})),
 ...preparationDirectory,
 ...operationsCategories.map(s=>({id:'operations:'+s.id,name:s.name,chapter:'operations',parentId:'',project:'shared',stage:'',builtin:true})),
]);
export function visibleDirectory(nodes=[],project){
 const all=new Map(builtinDirectory.map(n=>[n.id,{...n}]));
 for(const n of nodes)if(n&&['shared',project].includes(n.project)&&['handover','operations'].includes(n.chapter)&&typeof n.id==='string'&&typeof n.name==='string'&&!all.has(n.id))all.set(n.id,n);
 return [...all.values()].filter(n=>!n.parentId||all.has(n.parentId)&&!all.get(n.parentId).parentId&&all.get(n.parentId).chapter===n.chapter);
}
export function rootDirectory(node,nodes){return node?.parentId?nodes.find(n=>n.id===node.parentId):node;}
export function documentDirectory(document){
 if(document.libraryScope==='regional')return regionalOfficeSections.find(section=>section.natures.includes(document.nature))?.id||'';
 const explicit=document.directoryId||document.lifecycle?.directoryId;
 if(explicit&&explicit!==preparationStage)return explicit;
 const l=documentLifecycle(document);
 if(l.chapter==='handover'&&l.stage==='1'){
  const topic=preparationTopics.find(topic=>topic.nature&&topic.nature===document.nature)
   ||preparationTopics.find(topic=>topic.title?.test(document.title||''));
  if(topic)return 'prep:'+topic.key;
 }
 if(explicit)return explicit;
 return l.chapter==='handover'&&l.stage!==''&&l.stage!==undefined?'handover:'+l.stage:l.chapter==='operations'&&l.category?'operations:'+l.category:'';
}
export function directoryDocuments(documents,id,nodes=[]){
 if(!id)return documents;const children=new Set([id,...[...builtinDirectory,...nodes].filter(n=>n.parentId===id).map(n=>n.id)]);
 return documents.filter(d=>children.has(documentDirectory(d)));
}

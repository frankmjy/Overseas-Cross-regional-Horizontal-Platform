import {handoverStages,operationsCategories,documentLifecycle} from './lifecycle.mjs';
import {regionalOfficeSections} from './library-model.mjs';

export const builtinDirectory=Object.freeze([
 ...handoverStages.map(s=>({id:'handover:'+s.step,name:s.name,chapter:'handover',parentId:'',project:'shared',stage:s.step,builtin:true})),
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
 if(document.directoryId)return document.directoryId;
 const l=documentLifecycle(document);
 return l.chapter==='handover'&&l.stage!==''&&l.stage!==undefined?'handover:'+l.stage:l.chapter==='operations'&&l.category?'operations:'+l.category:'';
}
export function directoryDocuments(documents,id,nodes=[]){
 if(!id)return documents;const children=new Set([id,...nodes.filter(n=>n.parentId===id).map(n=>n.id)]);
 return documents.filter(d=>children.has(documentDirectory(d)));
}

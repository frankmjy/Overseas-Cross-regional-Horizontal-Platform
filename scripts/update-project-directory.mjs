import fs from 'node:fs/promises';
const dir='reports/overseas-directory-20261018',projectDir='reports/project-tables-20261018';
const file=dir+'/directory-plan.json',plan=JSON.parse(await fs.readFile(file,'utf8'));
if(plan.folders.some(f=>f.key.startsWith('launchpad-')))throw Error('该脚本属于早期目录迁移阶段，禁止覆盖现行“项目前置统筹”目录；请维护当前 directory-plan.json。');
try{await fs.writeFile(projectDir+'/previous-directory-plan.json',JSON.stringify(plan,null,2),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
const modules=JSON.parse(await fs.readFile(projectDir+'/folders.json','utf8'));
const progress=JSON.parse(await fs.readFile(projectDir+'/progress.json','utf8'));
if(Object.keys(progress.verified).length!==26)throw Error('project tables not fully verified');
const folderByKey=new Map(plan.folders.map(f=>[f.key,f]));
const roots=[['overview','00 Portfolio Overview（项目总览）'],['thailand','01 Thailand Project（泰国项目）'],['malaysia','02 Malaysia Project（马来项目）'],['knowledge','03 Shared Resources（共享资源）'],['team','04 Cross-Project Meetings（跨项目会议）'],['archive','90 Source Archive（历史来源归档）']].map(([key,name])=>({...folderByKey.get(key),key,name,parent:null}));
const shared=[['standards','01 Standards & Interfaces（标准与界面）'],['hse','02 EHS References（安全健康环境资料）'],['experience','03 Experience Sharing（经验共享）'],['people','04 People & Training Resources（人员培训资料）']].map(([key,name])=>({...folderByKey.get(key),key,name,parent:'knowledge'}));
shared.push({key:'templates',id:'bflxsOn9zL76BTIW',name:'05 Work Templates（通用工作模板）',parent:'knowledge'},{...(folderByKey.get('shared-research')||folderByKey.get('preparation')),id:'bflWUXW7sC5VStoB',key:'shared-research',name:'06 Shared Research（共用调研）',parent:'knowledge'});
plan.folders=[...roots,...modules,...shared,...plan.folders.filter(f=>['handover-history','operations-history','drafts'].includes(f.key))];
const sources=JSON.parse(await fs.readFile(projectDir+'/sources.json','utf8'));
for(const t of plan.tables){if(sources.some(s=>s.id===t.id)){t.parent=sources.find(s=>s.id===t.id).module==='preparation'?'shared-research':'templates';t.role='shared';delete t.prepared;delete t.new;}if(t.name==='Thailand Meetings（泰国项目会议）')t.parent='meetings-thailand';if(t.name==='Malaysia Meetings（马来项目会议）')t.parent='meetings-malaysia';}
for(const t of Object.values(progress.verified)){const row={...t,role:'business',new:true};const old=plan.tables.find(x=>x.id===t.id);if(old)Object.assign(old,row);else plan.tables.push(row);}
if([...plan.folders,...plan.tables].some(e=>!e.id))throw Error('directory ID missing');plan.at=new Date().toISOString();await fs.writeFile(file,JSON.stringify(plan,null,2));console.log(JSON.stringify({folders:plan.folders.length,tables:plan.tables.length,roots:roots.map(f=>f.name)}));

const pages={'/project-management':'projects','/index.html':'projects','/':'research','/research':'research','/cross-coordination':'materials','/staffing-reserve':'staffing','/knowledge-sharing':'knowledge','/meeting-trail':'meetings'};
const writes={
 materials:'#newMaterial,#pendingWrites,[data-edit-material]',
 staffing:'[data-edit],#retryOperation,#refresh',
 knowledge:'[data-edit-document],[data-new-document],[data-new-document-category],[data-document-retry],[data-document-upload],[data-document-operations]',
 meetings:'[data-new-meeting],[data-meeting-retry]',
 research:'[data-new-topic],[data-new-question],[data-new-content],[data-edit-content],[data-list-edit],[data-add-finding],[data-upload-task],[data-delete-question],[data-restore-question],[data-retry],[data-discard],[data-upload-retry]',
 projects:'#newTaskButton,[data-edit-task],[data-deliver-task],[data-complete-task],[data-delete-task],[data-milestone-task],[data-priority-task],[data-operation-retry],[data-operation-discard],[data-operation-upload],[data-restore-task],[data-priority-new],[data-priority-edit]'
};
const page=pages[location.pathname],selector=writes[page]||'[data-requires-edit]';
let editable=false;
if(page)document.documentElement.dataset.pageEdit='false';
export function applyPagePermissions(session){
 editable=!!session.permissions?.[page]?.edit;
 if(page)document.documentElement.dataset.pageEdit=String(editable);
 const nav=document.querySelector('.platform-navigation');
 for(const a of nav?.querySelectorAll('a[href]')||[]){const id=pages[new URL(a.href,location.href).pathname];a.hidden=!!id&&!session.permissions?.[id]?.view;}
 const menu=nav?.querySelector('.platform-coordination');if(menu)menu.hidden=![...menu.querySelectorAll('a')].some(a=>!a.hidden);
 const brand=document.querySelector('.platform-brand');if(brand&&session.home)brand.href=session.home;
 document.documentElement.dataset.accessReady='true';
}
// API authorization is authoritative; this capture guard also blocks stale UI controls.
document.addEventListener('click',event=>{if(!editable&&event.target.closest(selector)){event.preventDefault();event.stopImmediatePropagation();}},true);

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { matchesDocumentProject } from '../src/project-context-model.mjs';

const routes = {
  '/knowledge/directory.mjs': ['../directory.mjs', 'text/javascript; charset=utf-8'],
  '/knowledge-sharing': ['index.html', 'text/html; charset=utf-8'],
  '/meeting-trail': ['index.html', 'text/html; charset=utf-8'],
  '/knowledge/app.mjs': ['app.mjs', 'text/javascript; charset=utf-8'],
  '/knowledge/data.mjs': ['data.mjs', 'text/javascript; charset=utf-8'],
  '/knowledge/overview.mjs': ['overview.mjs', 'text/javascript; charset=utf-8'],
  '/knowledge/library-ui.mjs': ['library-ui.mjs', 'text/javascript; charset=utf-8'],
  '/knowledge/document-editor.mjs': ['document-editor.mjs', 'text/javascript; charset=utf-8'],
  '/knowledge/library-model.mjs': ['../library-model.mjs', 'text/javascript; charset=utf-8'],
  '/knowledge/lifecycle.mjs': ['../lifecycle.mjs', 'text/javascript; charset=utf-8'],
  '/knowledge/library.css': ['library.css', 'text/css; charset=utf-8'],
  '/knowledge/meetings-overview.mjs': ['meetings-overview.mjs', 'text/javascript; charset=utf-8'],
  '/knowledge/meeting-trail.mjs': ['meeting-trail.mjs', 'text/javascript; charset=utf-8'],
  '/knowledge/meeting-trail.css': ['meeting-trail.css', 'text/css; charset=utf-8'],
  '/knowledge/meeting-editor.mjs': ['meeting-editor.mjs', 'text/javascript; charset=utf-8'],
  '/knowledge/minutes-reader.mjs': ['minutes-reader.mjs', 'text/javascript; charset=utf-8'],
  '/knowledge/styles.css': ['styles.css', 'text/css; charset=utf-8'],
};

export function createKnowledgeHandler({ root, service, meetings, documents, minutes }) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost'), route = url.pathname;
    if (route === '/knowledge-sharing' && url.searchParams.get('view') === 'meetings' && ['GET','HEAD'].includes(req.method)) {
      const params=new URLSearchParams();for(const key of ['project','q','type','date'])if(url.searchParams.has(key))params.set(key,url.searchParams.get(key));
      res.writeHead(303,{Location:'/meeting-trail'+(params.size?'?'+params:''),'Cache-Control':'no-store'});res.end();return true;
    }
    if (route === '/api/knowledge') {
      const send = (status, payload) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff' });res.end(req.method==='HEAD'?undefined:JSON.stringify(payload)); };
      if (!['GET','HEAD'].includes(req.method)) { res.setHeader('Allow','GET, HEAD');send(405,{ok:false,error:'知识共享当前为只读。'}); }
      else if (!service) send(503,{ok:false,error:'知识共享数据连接未就绪。'});
      else try {
        const meetingOverview=url.searchParams.get('meetingOverview')==='1';
        const meetingOverviewAll=meetingOverview&&req.auth?.isAdmin===true;
        const refresh=url.searchParams.get('refresh')==='1';
        if(refresh&&!meetingOverview)documents?.refresh().catch(()=>{});
        const snapshot=service.read({refresh});
        const withMeetings=meetings?meetings.merge(snapshot):snapshot;
        const merged=documents&&!meetingOverview?documents.merge(withMeetings,req.auth):withMeetings;
        const project=req.auth?.project?.knowledgeKey;
        const inScope=id=>!project||id===project||id==='overseas'||meetingOverviewAll;
        const visible=(merged.meetings||[]).filter(meeting=>inScope(meeting.project));
        const sources=(merged.sources||[]).filter(source=>source.kind!=='meeting'||inScope(source.project)).map(source=>
          source.kind==='meeting-action'&&project&&!meetingOverviewAll?{...source,count:null}:source);
        const scoped={...merged,sources,meetings:visible,documents:meetingOverview?[]:(merged.documents||[]).filter(document=>!project||matchesDocumentProject(document,project))};
        send(200,{ok:true,...scopeKnowledgeAccess(scoped,req.auth?.permissions),meetingOverviewAll});
      } catch { send(503,{ok:false,error:'知识共享读取失败，请重试。'}); }
      return true;
    }
    if (!Object.hasOwn(routes, route)) return false;
    const headers = { 'Content-Type': routes[route][1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return true; }
    try {
      const bytes = await readFile(path.join(root, 'knowledge/web', routes[route][0]));
      res.writeHead(200, { ...headers, 'Content-Length': bytes.length });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('知识共享页面加载失败，请稍后重试。');
    }
    return true;
  };
}

export function scopeKnowledgeAccess(snapshot,permissions){
 if(!permissions)return snapshot;
 const documents=!!permissions.knowledge?.view,meetings=!!permissions.meetings?.view;
 if(documents&&meetings)return {...snapshot,capabilities:{knowledgeEdit:!!permissions.knowledge.edit,meetingsEdit:!!permissions.meetings.edit}};
 const common={state:snapshot.state,refreshing:snapshot.refreshing,updatedAt:snapshot.updatedAt,errors:[],sources:(snapshot.sources||[]).filter(s=>['meeting','meeting-action'].includes(s.kind)?meetings:documents),capabilities:{knowledgeEdit:documents&&!!permissions.knowledge.edit,meetingsEdit:meetings&&!!permissions.meetings.edit}};
 return documents?{...snapshot,...common,meetings:[]}:{...common,documents:[],meetings:meetings?snapshot.meetings||[]:[],categories:[],templates:[],projectLibraries:[],directoryNodes:[]};
}

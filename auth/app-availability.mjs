const origin='https://open.feishu.cn/open-apis';
const validId=id=>typeof id==='string'&&/^ou_[A-Za-z0-9_-]+$/.test(id);
const indirectMessage='应用范围包含部门、用户组或全员，暂无法核对完整名单。';

export async function readAppAvailability({appId,appSecret},{fetcher=fetch}={}){
 if(!appId||!appSecret)throw Error('飞书应用未配置。');
 const signal=AbortSignal.timeout(15000);
 async function request(route,{token,body}={}){
  const response=await fetcher(origin+route,{signal,redirect:'error',method:body?'POST':'GET',headers:{'Content-Type':'application/json; charset=utf-8',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const payload=await response.json();
  if(!response.ok||payload.code!==0)throw Error('飞书名单接口读取失败。');
  return payload;
 }
 const {tenant_access_token:token}=await request('/auth/v3/tenant_access_token/internal',{body:{app_id:appId,app_secret:appSecret}});
 if(typeof token!=='string'||!token)throw Error('飞书应用认证失败。');
 const members=new Set(),denied=new Set(),seen=new Set();
 const query=new URLSearchParams({app_id:appId,user_page_size:'1000'});
 for(;;){
  const {data}=await request('/application/v2/app/visibility?'+query,{token});
  if(!data||![0,1].includes(data.is_visible_to_all)||![0,1].includes(data.has_more_users))throw Error('飞书名单格式无效。');
  if(data.is_visible_to_all||['departments','groups','invisible_departments','invisible_groups'].some(key=>data[key]?.length))throw new RangeError(indirectMessage);
  for(const [rows,target] of [[data.users,members],[data.invisible_users,denied]]){
   for(const row of rows??[]){
    if(!validId(row?.open_id))throw Error('飞书名单缺少人员标识。');
    target.add(row.open_id);
   }
  }
  if(!data.has_more_users)break;
  const next=data.user_page_token;
  if(typeof next!=='string'||!next||seen.has(next)||seen.size>=100)throw Error('飞书名单分页未完成。');
  seen.add(next);query.set('user_page_token',next);
 }
 const people=[...members].filter(id=>!denied.has(id)).map(openId=>({openId,name:''}));
 for(let i=0;i<people.length;i+=5){
  const group=people.slice(i,i+5),ids=group.map(p=>p.openId);
  const {data}=await request('/contact/v3/users/basic_batch?user_id_type=open_id',{token,body:{user_ids:ids}});
  if(!Array.isArray(data?.users))throw Error('飞书人员资料格式无效。');
  const names=new Map(data.users.map(row=>[row.user_id,typeof row.name==='string'?row.name.trim():'']));
  for(const person of group)person.name=names.get(person.openId)||'';
 }
 return {people};
}

export class AppAvailability{
 constructor({auth,read=readAppAvailability,now=Date.now}){this.auth=auth;this.read=read;this.now=now;this.state=null;}
 current(){
  const config=this.auth.config();
  if(!this.state||this.state.appId!==config.appId)this.state={appId:config.appId,people:[],ready:false,error:'',lastAttempt:null,pending:null};
  return {config,state:this.state};
 }
 snapshot(){
  const {state}=this.current();
  return {people:state.people,writable:state.ready&&!state.error,error:state.error,refreshing:!!state.pending};
 }
 refreshIfNeeded(force=false){
  const {config,state}=this.current();
  if(state.pending)return state.pending;
  if(!force&&state.lastAttempt!==null&&this.now()-state.lastAttempt<60000)return;
  state.lastAttempt=this.now();
  state.pending=Promise.resolve().then(()=>this.read(config)).then(({people})=>{
   state.people=people;state.ready=true;state.error='';
  }).catch(error=>{
   const message=error instanceof RangeError&&error.message===indirectMessage?indirectMessage:'飞书授权名单读取失败。';
   state.error=message+(state.ready?'显示上次名单，暂不可修改。':'请刷新重试。');
  }).finally(()=>{state.pending=null;});
  return state.pending;
 }
}

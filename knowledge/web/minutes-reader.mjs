const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe=url=>{try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
function inline(value){const tokens=/!?\[([^\]]+)\]\((https:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;let result='',offset=0;for(const m of value.matchAll(tokens)){result+=esc(value.slice(offset,m.index));if(m[1]){const href=safe(m[2]);result+=href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(m[1])}</a>`:esc(m[1]);}else result+=m[3]?'<strong>'+esc(m[3])+'</strong>':'<code>'+esc(m[4])+'</code>';offset=m.index+m[0].length;}return result+esc(value.slice(offset));}
export function renderMarkdown(content){
 const lines=String(content).split('\n'),out=[];let list=false,code=false,buffer=[];
 const close=()=>{if(list){out.push('</ul>');list=false;}};
 for(let i=0;i<lines.length;i++){const line=lines[i].trim();if(line.startsWith('```')){close();if(code){out.push('<pre><code>'+esc(buffer.join('\n'))+'</code></pre>');buffer=[];}code=!code;continue;}if(code){buffer.push(lines[i]);continue;}
  if(!line){close();continue;}
  if(line.startsWith('|')&&/^\|?[\s:|-]+\|?$/.test(lines[i+1]?.trim()||'')){close();const cells=s=>s.trim().replace(/^\||\|$/g,'').split('|').map(v=>inline(v.trim()));const head=cells(line);i++;let rows='';while(lines[i+1]?.trim().startsWith('|'))rows+='<tr>'+cells(lines[++i]).map(c=>'<td>'+c+'</td>').join('')+'</tr>';out.push('<div class="minutes-table"><table><thead><tr>'+head.map(c=>'<th>'+c+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>');continue;}
  const h=/^(#{1,6})\s+(.+)$/.exec(line);if(h){close();const n=Math.min(5,h[1].length+2);out.push(`<h${n}>${inline(h[2])}</h${n}>`);continue;}
  const bullet=/^(?:[-*+]\s+|\d+[.、]\s+)(.*)/.exec(line);if(bullet){if(!list){out.push('<ul>');list=true;}const indent=Math.min(3,Math.floor((lines[i].match(/^\s*/)?.[0].length||0)/2));out.push(`<li class="minutes-indent-${indent}">`+inline(bullet[1])+'</li>');continue;}close();out.push(line.startsWith('>')?'<blockquote>'+inline(line.replace(/^>\s?/,''))+'</blockquote>':'<p>'+inline(line)+'</p>');
 }close();if(buffer.length)out.push('<pre><code>'+esc(buffer.join('\n'))+'</code></pre>');return out.join('');
}
let generation=0;
export function cancelMinutes(){generation++;}
export async function readMinutes(container,id,refresh=false){
 const current=++generation;container.innerHTML='<p class="minutes-state" role="status">正在读取纪要…</p>';
 container.onclick=event=>{if(event.target.closest('[data-minutes-retry]'))readMinutes(container,id,true);};
 try{for(let attempt=0;attempt<48;attempt++){
  const response=await fetch('/api/knowledge/meetings/minutes?id='+encodeURIComponent(id)+(refresh&&attempt===0?'&refresh=1':''),{signal:AbortSignal.timeout(15000)}),data=await response.json();if(current!==generation||!container.isConnected)return;if(!response.ok||!data.ok)throw Error(data.error||'纪要读取失败。');
  container.innerHTML=(data.content?'<div class="minutes-body">'+renderMarkdown(data.content)+'</div>':'')+(data.error?`<p class="minutes-state error" role="alert">${esc(data.error)}</p>`:!data.content?'<p class="minutes-state" role="status">正在读取纪要…</p>':'')+((data.error||!data.refreshing)?'<button class="text-button" data-minutes-retry>重新读取</button>':'');
  if(!data.refreshing)return;if(attempt===47)throw Error('读取耗时较长，可稍后重试或查看原文。');await new Promise(r=>setTimeout(r,2000));
 }}catch(e){if(current!==generation||!container.isConnected)return;container.innerHTML+=(container.querySelector('.minutes-body')?'':'')+`<p class="minutes-state error" role="alert">${esc(e.name==='TimeoutError'?'纪要读取超时，请重试。':e.message)}</p><button class="text-button" data-minutes-retry>重试</button>`;}
}

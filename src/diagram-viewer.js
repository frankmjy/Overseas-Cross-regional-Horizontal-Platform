import { createDiagramCanvas, containDiagramFocus } from './diagram-canvas.js';

const comparison={title:'马来数据中心 · 团队人员配置',src:'/assets/malaysia-team-comparison.svg',width:2400,height:1840};
export function comparisonForQuestion(question) {
  return question?.projectKey==='malaysia'&&question.sourceId==='Q-001'?comparison:null;
}
export function renderComparisonEntry(question) {
  return comparisonForQuestion(question)?'<button type="button" class="rename-button row-comparison" data-team-comparison aria-label="查看团队人员配置横向对比" title="人员配置对比"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 20V10h4v10M10 20V4h4v16M16 20V7h4v13M2 20h20"/></svg></button>':'';
}

export function createImageDiagram() {
  const dialog=document.createElement('dialog');dialog.className='image-diagram-dialog';dialog.setAttribute('aria-labelledby','imageDiagramTitle');
  dialog.innerHTML=`<header class="image-diagram-toolbar"><h3 id="imageDiagramTitle"></h3><button type="button" class="diagram-tool diagram-close" data-image-diagram-close title="关闭" aria-label="关闭对比图" autofocus><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></header><div class="image-diagram-canvas" aria-label="人员配置对比画布，可滚轮缩放和拖动"><div class="image-diagram-status" role="status"><span></span><button type="button" hidden>重试</button></div><div class="image-diagram-stage" hidden><img draggable="false"></div></div>`;
  document.body.append(dialog);
  const viewport=dialog.querySelector('.image-diagram-canvas'),stage=dialog.querySelector('.image-diagram-stage'),image=stage.querySelector('img'),status=dialog.querySelector('.image-diagram-status'),retry=status.querySelector('button');
  let canvas=null,returnFocus=null,definition=null,generation=0,disposeLoad=null;
  const setState=(state,message='')=>{viewport.dataset.state=state;status.hidden=state==='ready';stage.hidden=state!=='ready';status.querySelector('span').textContent=message;retry.hidden=state!=='error';canvas?.setEnabled(state==='ready');};
  const load=()=>{
    disposeLoad?.();
    const token=++generation;setState('loading','正在加载对比图…');
    const clean=()=>{clearTimeout(timer);image.onload=null;image.onerror=null;};
    disposeLoad=clean;
    const finish=(ready)=>{clean();if(token!==generation)return;setState(ready?'ready':'error',ready?'':'对比图加载失败，请重试。');if(ready)canvas.reset();};
    const timer=setTimeout(()=>finish(false),15000);
    image.onload=()=>finish(true);image.onerror=()=>finish(false);image.src=definition.src;
  };
  const close=()=>dialog.close();
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('keydown',event=>containDiagramFocus(dialog,event));
  dialog.addEventListener('click',event=>{
    if(event.target.closest('[data-image-diagram-close]')){close();return;}
    if(event.target!==dialog)return;const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)close();
  });
  dialog.addEventListener('close',()=>{generation++;disposeLoad?.();canvas?.setEnabled(false);if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});});
  retry.addEventListener('click',load);
  return {open(next,trigger){if(dialog.open)return;definition=next;returnFocus=trigger;dialog.querySelector('h3').textContent=next.title;image.alt=next.title;canvas?.destroy();canvas=createDiagramCanvas({viewport,stage,width:next.width,height:next.height});dialog.showModal();load();}};
}

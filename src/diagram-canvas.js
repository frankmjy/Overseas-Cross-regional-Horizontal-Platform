export function fitDiagram(viewWidth,viewHeight,width,height) {
  const ratio=Math.min(viewWidth/width,viewHeight/height);
  const fittedWidth=width*ratio,fittedHeight=height*ratio;
  return {width:fittedWidth,height:fittedHeight,x:(viewWidth-fittedWidth)/2,y:(viewHeight-fittedHeight)/2,scale:1};
}
export function zoomAt(state,delta,point) {
  const scale=Math.min(8,Math.max(0.4,state.scale*Math.exp(-Math.max(-240,Math.min(240,delta))*0.002)));
  return {...state,scale,x:point.x-(point.x-state.x)*scale/state.scale,y:point.y-(point.y-state.y)*scale/state.scale};
}
export function panBy(state,dx,dy) { return {...state,x:state.x+dx,y:state.y+dy}; }

export function createDiagramCanvas({viewport,stage,width,height}) {
  let enabled=false,state={scale:1,x:0,y:0},drag=null,suppressUntil=0;
  const events=new AbortController();
  const listen=(type,handler,options={})=>viewport.addEventListener(type,handler,{...options,signal:events.signal});
  viewport.tabIndex=0;
  const apply=()=>{
    stage.style.transform=`translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    viewport.dataset.zoom=String(state.scale);
  };
  const reset=()=>{
    if(!enabled||!viewport.clientWidth||!viewport.clientHeight)return;
    const fit=fitDiagram(viewport.clientWidth,viewport.clientHeight,width,height);
    stage.style.width=`${fit.width}px`;stage.style.height=`${fit.height}px`;
    state={scale:1,x:fit.x,y:fit.y};apply();
  };
  const endDrag=()=>{
    if(drag?.moved)suppressUntil=performance.now()+250;
    if(drag&&viewport.hasPointerCapture?.(drag.id))viewport.releasePointerCapture(drag.id);
    drag=null;viewport.classList.remove('is-dragging');
  };
  listen('wheel',event=>{
    if(!enabled||!event.deltaY)return;
    event.preventDefault();const box=viewport.getBoundingClientRect();
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1);
    state=zoomAt(state,delta,{x:event.clientX-box.left,y:event.clientY-box.top});apply();
  },{passive:false});
  listen('pointerdown',event=>{
    if(!enabled||event.button!==0||!event.isPrimary)return;
    suppressUntil=0;drag={id:event.pointerId,x:event.clientX,y:event.clientY,state:{...state},moved:false};
  });
  listen('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(!drag.moved&&Math.hypot(dx,dy)<5)return;
    if(!drag.moved){drag.moved=true;viewport.setPointerCapture(event.pointerId);viewport.classList.add('is-dragging');}
    event.preventDefault();state=panBy(drag.state,dx,dy);apply();
  });
  listen('pointerup',endDrag);
  listen('pointercancel',endDrag);
  listen('lostpointercapture',()=>{drag=null;viewport.classList.remove('is-dragging');});
  listen('click',event=>{
    if(event.detail&&performance.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}
  },{capture:true});
  listen('dragstart',event=>{if(enabled)event.preventDefault();});
  listen('keydown',event=>{
    if(!enabled||event.target!==viewport)return;
    if(['+','=','-'].includes(event.key)){event.preventDefault();state=zoomAt(state,event.key==='-'?120:-120,{x:viewport.clientWidth/2,y:viewport.clientHeight/2});apply();}
    else if(event.key==='0'){event.preventDefault();reset();}
    else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();state=panBy(state,event.key==='ArrowLeft'?40:event.key==='ArrowRight'?-40:0,event.key==='ArrowUp'?40:event.key==='ArrowDown'?-40:0);apply();}
  });
  const observer=new ResizeObserver(()=>{if(enabled)reset();});observer.observe(viewport);
  return {
    setEnabled(value){enabled=value;viewport.classList.toggle('diagram-canvas-active',value);if(!value)endDrag();},
    reset,
    destroy(){enabled=false;observer.disconnect();endDrag();events.abort();},
  };
}

export function containDiagramFocus(dialog,event) {
  if(event.key!=='Tab')return;
  const controls=[...dialog.querySelectorAll('button:not(:disabled), [tabindex="0"]')].filter(el=>el.getClientRects().length);
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
}

let request;
let requestedAt = 0;
let manualRequest;

function loadBrief() {
  if (manualRequest) return manualRequest.catch(()=>request);
  if (!request || Date.now() - requestedAt >= 60000) {
    requestedAt = Date.now();
    request = fetch('/api/overseas-brief', {signal: AbortSignal.timeout(8000)})
      .then(response => {
        if (!response.ok) throw Error('Overseas brief unavailable');
        return response.json();
      })
      .catch(() => ({state: 'unavailable', items: []}));
  }
  return request;
}

function refreshBrief() {
  if (manualRequest) return manualRequest;
  manualRequest=(async ()=>{
    const {readPlatformSession}=await import('./platform-context.js');
    const session=await readPlatformSession();
    if (!session.authenticated || !session.csrf) throw Error('Session expired');
    const response=await fetch('/api/overseas-brief/refresh',{method:'POST',headers:{'X-CSRF-Token':session.csrf},signal:AbortSignal.timeout(25000)});
    if (!response.ok) throw Error('Overseas brief refresh failed');
    const data=await response.json();
    if (data.state!=='ready') throw Error('Overseas brief refresh unavailable');
    requestedAt=Date.now();
    request=Promise.resolve(data);
    return data;
  })().finally(()=>{manualRequest=null;});
  return manualRequest;
}

const labels = {
  zh: {title: '海外速览', loading: '正在读取今日动态…', empty: '今日暂无动态', unavailable: '动态暂不可用', read: '打开原文', refresh:'刷新海外速览', syncing:'同步中…', synced:'已同步', previewRefresh:'重读预览快照', previewSyncing:'正在读取…', previewSynced:'已重读快照', previewFailed:'快照读取失败，请重试', failed:'同步失败，请重试', pause:'暂停滚动', play:'播放滚动'},
  en: {title: 'Overseas Brief', loading: 'Loading today’s updates…', empty: 'No updates today', unavailable: 'Updates unavailable', read: 'Open source', refresh:'Refresh overseas brief', syncing:'Syncing…', synced:'Synced', previewRefresh:'Reload preview snapshot', previewSyncing:'Reading…', previewSynced:'Snapshot reloaded', previewFailed:'Could not read snapshot. Try again.', failed:'Sync failed. Try again.', pause:'Pause scrolling', play:'Play scrolling'},
};

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function briefIcon() {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS(svg.namespaceURI,'path');
  path.setAttribute('d','M5 5h14v14H5zM8 9h8M8 12h8M8 15h5');
  svg.append(path);
  return svg;
}

class OverseasBrief extends HTMLElement {
  connectedCallback() {
    this.observer = new MutationObserver(() => this.render());
    this.observer.observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
    this.render();
    this.update = () => {
      if (document.hidden) return;
      loadBrief().then(data => { if (this.isConnected) { this.data = data; this.render(); } });
    };
    this.update();
    this.timer = setInterval(this.update, 60000);
    document.addEventListener('visibilitychange', this.update);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.update);
  }

  async refreshNow() {
    if (this.feedback==='syncing') return;
    this.feedback='syncing';
    this.render();
    try {
      this.data=await refreshBrief();
      this.feedback='synced';
    } catch { this.feedback='failed'; }
    if (this.isConnected) this.render();
  }

  render() {
    const english = document.documentElement.lang === 'en';
    const copy = labels[english ? 'en' : 'zh'];
    const {day, items = [], state = 'loading'} = this.data || {};
    const login=this.classList.contains('login-brief');
    const visibleRows=login?5:3;
    const canScroll=state==='ready'&&items.length>visibleRows;
    const header = node('header', 'brief-heading');
    const title=node('h2');
    const icon=node('span','brief-module-icon');
    icon.append(briefIcon());
    title.append(icon,node('span','',copy.title));
    header.append(title);
    const controls=node('div','brief-controls');
    let date;
    if (day) {
      date = node('time', '', day.replace(/-/g, '/'));
      date.dateTime = day;
      if(login)controls.append(date);
    }
    const refocus=this.contains(document.activeElement)&&document.activeElement.classList.contains('brief-refresh');
    const refocusMotion=this.contains(document.activeElement)&&document.activeElement.classList.contains('brief-motion');
    if (this.classList.contains('overview-brief')) {
      if(this.feedback){
        const feedbackKey=this.data?.preview?'preview'+this.feedback[0].toUpperCase()+this.feedback.slice(1):this.feedback;
        const feedback=node('span','brief-feedback',copy[feedbackKey]);
        feedback.setAttribute('role','status');
        controls.append(feedback);
      }
      const button=node('button','brief-refresh','↻');
      button.type='button';
      button.title=this.data?.preview?copy.previewRefresh:copy.refresh;
      button.setAttribute('aria-label',button.title);
      button.setAttribute('aria-disabled',String(this.feedback==='syncing'));
      button.addEventListener('click',()=>this.refreshNow());
      controls.append(button);
    }
    if(canScroll){
      const button=node('button','brief-motion');
      button.type='button';
      controls.append(button);
    }
    header.append(controls);
    this.dataset.state = state;
    this.setAttribute('translate', 'no');
    const footer=!login&&date?node('p','brief-date'):null;
    footer?.append(date);
    if (state !== 'ready' || !items.length) {
      this.replaceChildren(header, node('p', 'brief-status', copy[state === 'ready' ? 'empty' : state]));
      if(footer)this.append(footer);
      if(refocus)controls.querySelector('button')?.focus();
      return;
    }
    const list = node('ol', 'brief-items');
    if(canScroll){
      list.tabIndex=0;
      list.setAttribute('aria-label',copy.title);
    }
    const previousList=this.querySelector('.brief-items');
    const previousTicker=this.querySelector('brief-ticker');
    const previousFirst=previousList?.querySelector('a')?.getAttribute('href');
    const startIndex=previousFirst?items.findIndex(item=>item.url===previousFirst):0;
    const ordered=startIndex>0?[...items.slice(startIndex),...items.slice(0,startIndex)]:items;
    for (const item of ordered) {
      const title = english && item.titleEn ? item.titleEn : item.title;
      const summary = english && item.summaryEn ? item.summaryEn : item.summary;
      const link = node('a', 'brief-link');
      link.href = item.url;
      link.rel = 'noreferrer noopener';
      link.target = '_blank';
      link.setAttribute('aria-label', `${title} · ${copy.read}`);
      link.title=title;
      if(login)link.append(headlineFor(title));
      if (item.region || item.source) {
        const meta=node('span','brief-meta');
        if (item.region) meta.append(node('span','brief-region',item.region));
        if (item.region && item.source) meta.append(document.createTextNode(' · '));
        if (item.source) meta.append(node('span','brief-source',item.source));
        link.append(meta);
      }
      if(!login)link.append(headlineFor(title), node('span', 'brief-summary', summary));
      const entry = node('li');
      entry.append(link);
      list.append(entry);
    }
    const scroll=previousList?.scrollTop||0;
    const focusedIndex=previousList?[...previousList.querySelectorAll('a')].indexOf(document.activeElement):-1;
    const focusList=previousList&&document.activeElement===previousList;
    const ticker=node('brief-ticker');
    ticker.toggleAttribute('data-can-scroll',canScroll);
    ticker.paused=previousTicker?.paused||false;
    ticker.append(list);
    this.replaceChildren(header,ticker);
    if(footer)this.append(footer);
    list.scrollTop=scroll;
    if(focusList)list.focus({preventScroll:true});
    if(focusedIndex>=0)list.querySelectorAll('a')[focusedIndex]?.focus({preventScroll:true});
    if(refocus)controls.querySelector('button')?.focus();
    if(refocusMotion)controls.querySelector('.brief-motion')?.focus({preventScroll:true});
  }
}

function headlineFor(title){
  const headline=node('span','brief-headline');
  const arrow=node('span','brief-arrow','↗');
  arrow.setAttribute('aria-hidden','true');
  headline.append(node('strong','',title),arrow);
  return headline;
}

class BriefTicker extends HTMLElement {
  connectedCallback(){
    if(!this.hasAttribute('data-can-scroll'))return;
    const list=this.querySelector('ol');
    if(!list)return;
    const panel=this.parentElement;
    const button=panel.querySelector('.brief-motion');
    const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    const canHover=matchMedia('(hover: hover)');
    const controller=new AbortController();
    this.controller=controller;
    const options={signal:controller.signal};
    let resumeAfter=0, pointer, blockClickUntil=0;
    const defer=()=>{resumeAfter=performance.now()+6000;};
    this.syncPauseButton=()=>{
      if(!button)return;
      const copy=labels[document.documentElement.lang==='en'?'en':'zh'];
      button.textContent=this.paused?'▷':'Ⅱ';
      button.title=copy[this.paused?'play':'pause'];
      button.setAttribute('aria-label',button.title);
    };
    this.syncPauseButton();
    this.languageObserver=new MutationObserver(this.syncPauseButton);
    this.languageObserver.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    button?.addEventListener('click',()=>{
      this.paused=!this.paused;
      this.syncPauseButton();
    },options);
    for(const type of ['wheel','touchstart','touchmove'])list.addEventListener(type,defer,{...options,passive:true});
    list.addEventListener('dragstart',event=>event.preventDefault(),options);
    list.addEventListener('pointerdown',event=>{
      if(event.pointerType==='mouse'&&event.button===0){
        pointer={id:event.pointerId,y:event.clientY,scroll:list.scrollTop};
        defer();
      }
    },options);
    list.addEventListener('pointermove',event=>{
      if(pointer?.id!==event.pointerId||!event.buttons)return;
      const delta=event.clientY-pointer.y;
      if(!pointer.dragging&&Math.abs(delta)<5)return;
      if(!pointer.dragging){
        pointer.dragging=true;
        list.setPointerCapture(pointer.id);
        this.setAttribute('data-dragging','');
      }
      list.scrollTop=pointer.scroll-delta;
      event.preventDefault();
    },options);
    for(const type of ['pointerup','pointercancel','lostpointercapture','pointerleave']){
      list.addEventListener(type,event=>{
        if(pointer?.id!==event.pointerId||(type==='pointerleave'&&pointer.dragging))return;
        if(pointer.dragging)blockClickUntil=performance.now()+300;
        pointer=null;
        this.removeAttribute('data-dragging');
        defer();
      },options);
    }
    list.addEventListener('click',event=>{
      if(event.detail&&performance.now()<blockClickUntil){
        event.preventDefault();
        event.stopPropagation();
      }
    },{...options,capture:true});

    let previous=performance.now(),distance=0;
    const tick=now=>{
      if(!this.paused&&!reducedMotion.matches&&!document.hidden&&!pointer&&
        now>=resumeAfter&&!list.matches(':focus-within')&&!(canHover.matches&&panel.matches(':hover'))&&list.scrollHeight>list.clientHeight){
        distance+=Math.min(now-previous,50)*.011;
        if(distance>=1){
          const offset=list.scrollTop+Math.floor(distance);
          distance%=1;
          const first=list.firstElementChild;
          const rowHeight=first.getBoundingClientRect().height;
          if(offset>=rowHeight){
            list.append(first);
            list.scrollTop=offset-rowHeight;
          }else list.scrollTop=offset;
        }
      }
      previous=now;
      this.frame=requestAnimationFrame(tick);
    };
    this.frame=requestAnimationFrame(tick);
  }

  disconnectedCallback(){
    this.controller?.abort();
    this.languageObserver?.disconnect();
    cancelAnimationFrame(this.frame);
  }
}

if(!customElements.get('brief-ticker'))customElements.define('brief-ticker',BriefTicker);
if (!customElements.get('overseas-brief')) customElements.define('overseas-brief', OverseasBrief);

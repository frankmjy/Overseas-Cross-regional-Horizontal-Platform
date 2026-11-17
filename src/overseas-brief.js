const requests = new Map();
const overviewFilters = {region: 'all', days: 1};
const regionNames = {
  all: ['全部', 'All'],
  southeastAsia: ['东南亚', 'Southeast Asia'],
  middleEast: ['中东', 'Middle East'],
  europe: ['欧洲', 'Europe'],
  japanKorea: ['日韩', 'Japan & Korea'],
  americas: ['美洲', 'Americas'],
  china: ['中国', 'China'],
};
let manualRequest;

function loadBrief(days) {
  if (manualRequest) return manualRequest.catch(()=>{}).then(()=>loadBrief(days));
  let cached = requests.get(days);
  if (!cached || Date.now() - cached.at >= 60000) {
    const url = days === 1 ? '/api/overseas-brief' : '/api/overseas-brief?days=' + days;
    const request = fetch(url, {signal: AbortSignal.timeout(8000)})
      .then(response => {
        if (!response.ok) throw Error('Overseas brief unavailable');
        return response.json();
      })
      .catch(() => ({state: 'unavailable', items: []}));
    cached = {at: Date.now(), request};
    requests.set(days, cached);
  }
  return cached.request;
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
    requests.clear();
    requests.set(1, {at: Date.now(), request: Promise.resolve(data)});
    return data;
  })().finally(()=>{manualRequest=null;});
  return manualRequest;
}

const labels = {
  zh: {title: '海外速览', loading: '正在读取今日动态…', empty: '今日暂无动态', unavailable: '动态暂不可用', read: '打开原文', refresh:'刷新海外速览', syncing:'同步中…', synced:'已同步', previewRefresh:'重读预览快照', previewSyncing:'正在读取…', previewSynced:'已重读快照', previewFailed:'快照读取失败，请重试', failed:'同步失败，请重试', pause:'暂停滚动', play:'播放滚动'},
  en: {title: 'Overseas Brief', loading: 'Loading today’s updates…', empty: 'No updates today', unavailable: 'Updates unavailable', read: 'Open source', refresh:'Refresh overseas brief', syncing:'Syncing…', synced:'Synced', previewRefresh:'Reload preview snapshot', previewSyncing:'Reading…', previewSynced:'Snapshot reloaded', previewFailed:'Could not read snapshot. Try again.', failed:'Sync failed. Try again.', pause:'Pause scrolling', play:'Play scrolling'},
};
const filterLabels = {
  zh: {regions: '地区筛选', period: '按展示日期筛选', today: '今天', week: '近 7 天', month: '近 30 天', noResults: '此范围暂无资讯'},
  en: {regions: 'Filter by region', period: 'Filter by display date', today: 'Today', week: 'Last 7 days', month: 'Last 30 days', noResults: 'No updates in this range'},
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
    this.filters ??= this.classList.contains('overview-brief') ? overviewFilters : {region: 'all', days: 1};
    this.observer = new MutationObserver(() => this.render());
    this.observer.observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
    this.render();
    this.update = async () => {
      if (document.hidden) return;
      const ticket = this.readTicket = Symbol();
      const data = await loadBrief(this.filters.days);
      if (this.isConnected && ticket === this.readTicket && data !== this.data) {
        this.data = data;
        this.render();
      }
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
      await refreshBrief();
      await this.update();
      this.feedback='synced';
    } catch { this.feedback='failed'; }
    if (this.isConnected) this.render();
  }

  render({reset = false, previousRegion} = {}) {
    const english = document.documentElement.lang === 'en';
    const copy = labels[english ? 'en' : 'zh'];
    const filterCopy = filterLabels[english ? 'en' : 'zh'];
    const {day, items: allItems = [], state = 'loading'} = this.data || {};
    const {region, days} = this.filters;
    const items = region === 'all' ? allItems : allItems.filter(item => item.regions?.includes(region));
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
    const period = node('select', 'brief-period');
    period.setAttribute('aria-label', filterCopy.period);
    period.title = filterCopy.period;
    for (const [value, label] of [[1, filterCopy.today], [7, filterCopy.week], [30, filterCopy.month]]) {
      period.add(new Option(label, String(value), false, value === days));
    }
    period.addEventListener('change', () => {
      this.filters.days = Number(period.value);
      this.data = undefined;
      this.render({reset: true});
      this.update();
    });
    controls.append(period);
    let date;
    if (day && !login) {
      date = node('time', '', day.replace(/-/g, '/'));
      date.dateTime = day;
    }
    const refocus=this.contains(document.activeElement)&&document.activeElement.classList.contains('brief-refresh');
    const refocusMotion=this.contains(document.activeElement)&&document.activeElement.classList.contains('brief-motion');
    const refocusPeriod=this.contains(document.activeElement)&&document.activeElement.classList.contains('brief-period');
    const refocusRegion=this.contains(document.activeElement)&&document.activeElement.dataset.briefRegion;
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
    const regions = node('div', 'brief-regions');
    regions.setAttribute('role', 'group');
    regions.setAttribute('aria-label', filterCopy.regions);
    const selection = node('span', 'brief-region-selection');
    selection.setAttribute('aria-hidden', 'true');
    const selectionPosition = () => {
      const track = regions.getBoundingClientRect();
      const {x, y, width} = selection.getBoundingClientRect();
      return {x: x - track.x, y: y - track.y, width};
    };
    for (const [key, names] of Object.entries(regionNames)) {
      const button = node('button', 'brief-region-button', names[Number(english)]);
      button.type = 'button';
      button.dataset.briefRegion = key;
      button.setAttribute('aria-pressed', String(key === region));
      if (key === region) button.prepend(selection);
      button.addEventListener('click', () => {
        if (this.filters.region === key) return;
        const previousRegion = selectionPosition();
        this.filters.region = key;
        this.render({reset: true, previousRegion});
      });
      regions.append(button);
    }
    const restoreControls = () => {
      if (refocus) controls.querySelector('.brief-refresh')?.focus({preventScroll:true});
      if (refocusMotion) controls.querySelector('.brief-motion')?.focus({preventScroll:true});
      if (refocusPeriod) period.focus({preventScroll:true});
      if (refocusRegion) regions.querySelector('[data-brief-region="' + refocusRegion + '"]')?.focus({preventScroll:true});
    };
    this.dataset.state = state;
    this.setAttribute('translate', 'no');
    const footer=date?node('p','brief-date'):null;
    footer?.append(date);
    const replaceContent = content => {
      this.replaceChildren(header, ...(login ? [regions, content] : [content, regions]));
      if (footer) this.append(footer);
      restoreControls();
      if (previousRegion && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const current = selectionPosition();
        if (previousRegion.width && current.width) selection.animate([
          {transform: `translate(${previousRegion.x - current.x}px, ${previousRegion.y - current.y}px) scaleX(${previousRegion.width / current.width})`},
          {transform: 'none'},
        ], {duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)'});
      }
    };
    if (state !== 'ready' || !items.length) {
      const text = state === 'ready' ? (region === 'all' && days === 1 ? copy.empty : filterCopy.noResults)
        : state === 'loading' && days !== 1 ? (english ? 'Loading updates…' : '正在读取动态…') : copy[state];
      const status = node('p', 'brief-status', text);
      status.setAttribute('role', 'status');
      replaceContent(status);
      return;
    }
    const list = node('ol', 'brief-items');
    if(canScroll){
      list.tabIndex=0;
      list.setAttribute('aria-label',copy.title);
    }
    const previousList=this.querySelector('.brief-items');
    const previousTicker=this.querySelector('brief-ticker');
    const previousFirst=!reset&&previousList?.querySelector('a')?.getAttribute('href');
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
      const showDay = days > 1 && item.day;
      if (item.region || item.source || showDay) {
        const meta=node('span','brief-meta');
        if (showDay) {
          const time = node('time', '', item.day.slice(5).replace('-', '/'));
          time.dateTime = item.day;
          meta.append(time);
          if (item.region || item.source) meta.append(document.createTextNode(' · '));
        }
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
    const scroll=reset?0:previousList?.scrollTop||0;
    const focusedIndex=previousList?[...previousList.querySelectorAll('a')].indexOf(document.activeElement):-1;
    const focusList=previousList&&document.activeElement===previousList;
    const ticker=node('brief-ticker');
    ticker.toggleAttribute('data-can-scroll',canScroll);
    ticker.paused=previousTicker?.paused||false;
    ticker.append(list);
    replaceContent(ticker);
    list.scrollTop=scroll;
    if(focusList)list.focus({preventScroll:true});
    if(focusedIndex>=0)list.querySelectorAll('a')[focusedIndex]?.focus({preventScroll:true});
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

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
  zh: {title: '海外速览', loading: '正在读取今日动态…', empty: '今日暂无动态', unavailable: '动态暂不可用', read: '打开原文', refresh:'刷新海外速览', syncing:'同步中…', synced:'已同步', failed:'同步失败，请重试'},
  en: {title: 'Overseas Brief', loading: 'Loading today’s updates…', empty: 'No updates today', unavailable: 'Updates unavailable', read: 'Open source', refresh:'Refresh overseas brief', syncing:'Syncing…', synced:'Synced', failed:'Sync failed. Try again.'},
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
    const header = node('header', 'brief-heading');
    const title=node('h2');
    const icon=node('span','brief-module-icon');
    icon.append(briefIcon());
    title.append(icon,node('span','',copy.title));
    header.append(title);
    const controls=node('div','brief-controls');
    if (day) {
      const date = node('time', '', day.replace(/-/g, '/'));
      date.dateTime = day;
      controls.append(date);
    }
    const refocus=this.contains(document.activeElement)&&document.activeElement.classList.contains('brief-refresh');
    if (this.classList.contains('overview-brief')) {
      if(this.feedback){
        const feedback=node('span','brief-feedback',copy[this.feedback]);
        feedback.setAttribute('role','status');
        controls.append(feedback);
      }
      const button=node('button','brief-refresh','↻');
      button.type='button';
      button.title=copy.refresh;
      button.setAttribute('aria-label',copy.refresh);
      button.setAttribute('aria-disabled',String(this.feedback==='syncing'));
      button.addEventListener('click',()=>this.refreshNow());
      controls.append(button);
    }
    header.append(controls);
    this.dataset.state = state;
    this.setAttribute('translate', 'no');
    if (state !== 'ready' || !items.length) {
      this.replaceChildren(header, node('p', 'brief-status', copy[state === 'ready' ? 'empty' : state]));
      if(refocus)controls.querySelector('button')?.focus();
      return;
    }
    const list = node('ol', 'brief-items');
    if(items.length>5){
      list.tabIndex=0;
      list.setAttribute('aria-label',copy.title);
    }
    for (const item of items) {
      const title = english && item.titleEn ? item.titleEn : item.title;
      const summary = english && item.summaryEn ? item.summaryEn : item.summary;
      const link = node('a', 'brief-link');
      link.href = item.url;
      link.rel = 'noreferrer noopener';
      link.target = '_blank';
      link.setAttribute('aria-label', `${title} · ${copy.read}`);
      if (item.region || item.source) {
        const meta=node('span','brief-meta');
        if (item.region) meta.append(node('span','brief-region',item.region));
        if (item.region && item.source) meta.append(document.createTextNode(' · '));
        if (item.source) meta.append(node('span','brief-source',item.source));
        link.append(meta);
      }
      const headline = node('span', 'brief-headline');
      const arrow = node('span', 'brief-arrow', '↗');
      arrow.setAttribute('aria-hidden', 'true');
      headline.append(node('strong', '', title), arrow);
      link.append(headline, node('span', 'brief-summary', summary));
      const entry = node('li');
      entry.append(link);
      list.append(entry);
    }
    const previousList=this.querySelector('.brief-items');
    const scroll=previousList?.scrollTop||0;
    const focusedIndex=previousList?[...previousList.querySelectorAll('a')].indexOf(document.activeElement):-1;
    const focusList=previousList&&document.activeElement===previousList;
    this.replaceChildren(header, list);
    list.scrollTop=scroll;
    if(focusList)list.focus({preventScroll:true});
    if(focusedIndex>=0)list.querySelectorAll('a')[focusedIndex]?.focus({preventScroll:true});
    if(refocus)controls.querySelector('button')?.focus();
  }
}

if (!customElements.get('overseas-brief')) customElements.define('overseas-brief', OverseasBrief);

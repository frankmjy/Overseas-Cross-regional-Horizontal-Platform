import { translateInterface, translateProjectTitle, translateWeekday } from './platform-translations.js';

const storageKey = 'overseas-platform.language';
const attributes = ['aria-label', 'aria-description', 'placeholder', 'title', 'alt', 'label', 'data-label'];
const protectedContent = 'script,style,textarea,pre,code,svg,[contenteditable],[translate="no"]';
const textSources = new WeakMap();
const attributeSources = new WeakMap();
const businessTranslations = new Map();
const translationQueue = new Map();
const han = /[\u3400-\u9fff]/u;
let translator;
let checkingTranslator;
let translating = false;
const root = document.documentElement;
let language = 'zh-CN';

try {
  if (localStorage.getItem(storageKey) === 'en') language = 'en';
} catch { /* The switch still works when browser storage is disabled. */ }

function localize(current, prior, translate = translateInterface) {
  const original = current === prior?.display ? prior.original : current;
  return { original, display: language === 'en' ? translate(original) : original };
}

function prepareTranslator() {
  if (checkingTranslator) return;
  checkingTranslator = import('./platform-context.js')
    .then(({ readPlatformSession }) => readPlatformSession())
    .then(session => {
      if (!session.businessTranslationEnabled) return;
      translator = {
        async translate(text, { signal }) {
          const response = await fetch('/api/translation', {
            method: 'POST', signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          });
          if (!response.ok) throw Error('Business translation unavailable');
          return (await response.json()).translation;
        },
      };
      if (language === 'en') translateTree(root);
    })
    .catch(() => { checkingTranslator = undefined; });
}

function scheduleTranslations() {
  if (translating || !translator || !translationQueue.size || language !== 'en') return;
  translating = true;
  setTimeout(async () => {
    try {
      const instance = translator;
      while (language === 'en' && translationQueue.size) {
        const [source, nodes] = translationQueue.entries().next().value;
        try {
          const translated = (await instance.translate(source, { signal: AbortSignal.timeout(10000) })).trim();
          if (translated && translated !== source) {
            if (businessTranslations.size >= 1200) businessTranslations.delete(businessTranslations.keys().next().value);
            businessTranslations.set(source, translated);
            if (language === 'en') for (const node of nodes) {
              if (node.isConnected && node.data === source) translateText(node);
            }
          }
        } catch { /* Keep the original content if device translation fails. */ }
        translationQueue.delete(source);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } finally {
      translating = false;
      if (language !== 'en') translationQueue.clear();
      scheduleTranslations();
    }
  }, 0);
}

function translateElement(element) {
  const records = attributeSources.get(element) ?? {};
  for (const name of attributes) {
    if (!element.hasAttribute(name)) {
      delete records[name];
      continue;
    }
    const current = element.getAttribute(name);
    const translator = ['title', 'aria-label'].includes(name) && element.hasAttribute('data-project-title-tooltip')
      ? value => value.split(/( · |、)/).map(part => businessTranslations.get(part) ?? translateInterface(translateProjectTitle(part))).join('')
      : translateInterface;
    const result = localize(current, records[name], translator);
    if (result.original !== result.display || records[name]) records[name] = result;
    if (current !== result.display) element.setAttribute(name, result.display);
  }
  if (Object.keys(records).length) attributeSources.set(element, records);
}

function translateText(node) {
  if (!node.parentElement || node.parentElement.closest(protectedContent)) return;
  const current = node.data;
  const element = node.parentElement;
  const projectTitle = element.hasAttribute('data-project-title');
  const business = projectTitle || element.hasAttribute('data-business-text');
  const translate = business ? value => businessTranslations.get(value) ?? (projectTitle ? translateProjectTitle(value) : value)
    : element.hasAttribute('data-weekday-label') ? translateWeekday : translateInterface;
  const result = localize(current, textSources.get(node), translate);
  if (business && language === 'en' && translator && result.original === result.display && han.test(result.original)) {
    if (translationQueue.has(result.original) || translationQueue.size < 1000) {
      const nodes = translationQueue.get(result.original) ?? new Set();
      nodes.add(node);
      translationQueue.set(result.original, nodes);
      scheduleTranslations();
    }
  }
  if (current === result.display) return;
  const option = node.parentElement.closest('option');
  if (option && !option.hasAttribute('value')) option.setAttribute('value', option.value);
  textSources.set(node, result);
  node.data = result.display;
}

function translateTree(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    translateText(node);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || node.closest(protectedContent)) return;
  translateElement(node);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(candidate) {
      return candidate.nodeType === Node.ELEMENT_NODE && candidate.matches(protectedContent)
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
  });
  for (let child = walker.nextNode(); child; child = walker.nextNode()) {
    if (child.nodeType === Node.TEXT_NODE) translateText(child);
    else translateElement(child);
  }
}

function refreshLanguageControl() {
  document.querySelectorAll('[data-platform-language]').forEach(button => {
    const english = button.dataset.platformLanguage === 'en';
    button.setAttribute('aria-pressed', String(english === (language === 'en')));
  });
}

function setLanguage(value, persist = false) {
  language = value === 'en' ? 'en' : 'zh-CN';
  root.lang = language;
  if (language === 'en' && !document.querySelector('#loginPanel')) prepareTranslator();
  if (persist) {
    try { localStorage.setItem(storageKey, language); } catch { /* Apply for this page. */ }
  }
  translateTree(root);
  refreshLanguageControl();
}

class PlatformLanguage extends HTMLElement {
  connectedCallback() {
    if (this.childElementCount) return;
    this.setAttribute('translate', 'no');
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', 'Language / 语言');
    for (const [value, label, title] of [['zh-CN', '中', '中文'], ['en', 'EN', 'English']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.lang = value;
      button.textContent = label;
      button.title = title;
      button.setAttribute('aria-label', title);
      button.dataset.platformLanguage = value;
      button.addEventListener('click', () => setLanguage(value, true));
      this.append(button);
    }
    refreshLanguageControl();
  }
}

customElements.define('platform-language', PlatformLanguage);
setLanguage(language);
const observer = new MutationObserver(changes => {
  if (language !== 'en') return;
  const nodes = new Set();
  const changedAttributes = new Set();
  for (const change of changes) {
    if (change.type === 'attributes') {
      changedAttributes.add(change.target);
    } else if (change.type === 'characterData') {
      nodes.add(change.target);
    } else {
      for (const node of change.addedNodes) nodes.add(node);
    }
  }
  for (const node of nodes) {
    if (!node.isConnected) continue;
    const parent = node.parentElement;
    if (!parent || !nodes.has(parent)) translateTree(node);
  }
  for (const element of changedAttributes) {
    if (element.isConnected && !element.closest(protectedContent)) translateElement(element);
  }
});
observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
window.addEventListener('storage', event => {
  if (event.key === storageKey) setLanguage(event.newValue);
});

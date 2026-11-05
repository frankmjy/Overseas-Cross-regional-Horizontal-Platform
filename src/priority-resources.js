const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
export const attachmentLimit = 20 * 1024 * 1024;
export function validatePriorityResources({ attachments = [], links = [] } = {}) {
  if (!Array.isArray(attachments) || attachments.length > 10 || !Array.isArray(links) || links.length > 10) throw Error('每项最多添加 10 个附件和 10 条链接。');
  const files = attachments.map(file => {
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(file?.id || '') || typeof file.name !== 'string' || !file.name.trim() || file.name.length > 180 || /[/\\\x00-\x1f\x7f]/.test(file.name) || !Number.isSafeInteger(file.size) || file.size <= 0) throw Error('附件信息无效。');
    if (file.size > attachmentLimit) throw Error('单个附件不能超过 20 MB。');
    return { id:file.id, name:file.name, size:file.size };
  });
  if (new Set(files.map(file => file.id)).size !== files.length) throw Error('附件标识重复。');
  if (files.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) throw Error('每项附件合计不能超过 50 MB。');
  const urls = links.map(link => {
    const value = String(link?.url || '').trim(), title = String(link?.title || '').trim();
    let url; try { url = new URL(value); } catch { throw Error('请填写完整的 HTTP 或 HTTPS 链接。'); }
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || value.length > 2000 || title.length > 80) throw Error('链接只支持 HTTP / HTTPS，不含账号密码；名称最多 80 字。');
    return { title:title || url.hostname, url:url.href };
  });
  return { attachments:files, links:urls };
}

const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const complete = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || Error('保存已取消。')); tx.onerror = () => {}; });
export function createPriorityPreviewStore(indexedDB = globalThis.indexedDB) {
  let opening;
  const database = () => {
    if (!indexedDB) return Promise.reject(Error('浏览器存储不可用，无法保存示例附件。'));
    if (!opening) opening = new Promise((resolve, reject) => {
      const req = indexedDB.open('overseas-priority-preview', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('items');
        req.result.createObjectStore('files', { keyPath:'key' }).createIndex('scope', 'scope');
      };
      req.onerror = () => { opening = null; reject(req.error); };
      req.onblocked = () => { opening = null; reject(Error('请关闭其他项目页面后重试。')); };
      req.onsuccess = () => { const db = req.result; db.onversionchange = () => { db.close(); opening = null; }; resolve(db); };
    });
    return opening;
  };
  return {
    async load(scope) { const db = await database(); return request(db.transaction('items').objectStore('items').get(scope)); },
    async save(scope, items, pending = new Map(), revision = 0) {
      const used = new Map();
      for (const item of items) for (const file of validatePriorityResources(item).attachments) {
        if (used.has(file.id)) throw Error('附件不能属于多个事项。');
        used.set(file.id, file);
      }
      const db = await database(), tx = db.transaction(['items','files'], 'readwrite'), done = complete(tx);
      try {
        const documents = tx.objectStore('items'), files = tx.objectStore('files');
        const previous = await request(documents.get(scope));
        if ((previous?.revision || 0) !== revision) throw Error('事项已在其他页面更新，请关闭弹窗后刷新页面重试。');
        const keys = await request(files.index('scope').getAllKeys(scope)), existing = new Set(keys);
        for (const [id, info] of used) {
          const key = `${scope}:${id}`, blob = pending.get(id);
          if (blob) {
            if (!(blob instanceof Blob) || blob.size !== info.size) throw Error('附件内容与文件信息不一致，请重新选择。');
            files.put({ key, scope, blob });
          } else if (!existing.has(key)) throw Error(`附件“${info.name}”已丢失，请重新添加。`);
        }
        for (const key of keys) if (![...used.keys()].some(id => key === `${scope}:${id}`)) files.delete(key);
        documents.put({ items, revision:revision + 1 }, scope);
      } catch (error) { tx.abort(); await done.catch(() => {}); throw error; }
      await done;
      return revision + 1;
    },
    async file(scope, id) {
      const db = await database(), record = await request(db.transaction('files').objectStore('files').get(`${scope}:${id}`));
      if (!record?.blob) throw Error('附件已丢失，请重新添加。');
      return record.blob;
    },
  };
}

export function renderPriorityResources({ attachments = [], links = [] }, pending = new Map()) {
  return attachments.map(file => `<li><span class="priority-resource-icon">↧</span>${/^\/api\/priorities\/files\/[a-zA-Z0-9-]+\/[a-f0-9-]{36}\?project=(th-001|my-001)$/.test(file.url || '') ? `<a href="${esc(file.url)}" download="${esc(file.name)}" data-priority-download-link title="${esc(file.name)}">${esc(file.name)}</a>` : `<button type="button" data-priority-download="${esc(file.id)}" title="${esc(file.name)}">${esc(file.name)}</button>`}<small>${(file.size / 1024).toFixed(file.size < 1024 ? 1 : 0)} KB${pending.has(file.id) ? ' · 待保存' : ''}</small><button type="button" data-priority-file-remove="${esc(file.id)}" aria-label="移除附件 ${esc(file.name)}">×</button></li>`).join('') + links.map((link, index) => `<li><span class="priority-resource-icon">↗</span><a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer" title="${esc(link.url)}">${esc(link.title)}</a><small>${esc(new URL(link.url).hostname)}</small><button type="button" data-priority-link-remove="${index}" aria-label="移除链接 ${esc(link.title)}">×</button></li>`).join('');
}

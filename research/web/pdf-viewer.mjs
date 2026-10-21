import { getDocument, GlobalWorkerOptions } from '/assets/pdfjs/build/pdf.mjs';
GlobalWorkerOptions.workerSrc = '/assets/pdfjs/build/pdf.worker.mjs';

export function mountPDF(container, url) {
  let document = null, pageNumber = 1, zoom = 1, render = null, disposed = false, revision = 0;
  container.innerHTML = `<section class="pdf-viewer" aria-label="PDF 文档"><div class="pdf-toolbar"><button type="button" data-pdf-prev aria-label="上一页 PDF" disabled>上一页</button><span data-pdf-pages>正在读取…</span><button type="button" data-pdf-next aria-label="下一页 PDF" disabled>下一页</button><span class="pdf-toolbar-divider"></span><button type="button" data-pdf-minus aria-label="缩小 PDF" disabled>−</button><button type="button" data-pdf-plus aria-label="放大 PDF" disabled>＋</button></div><div class="pdf-page"><p class="pdf-status" role="status">正在读取 PDF 原件…</p><canvas hidden role="img" aria-label="PDF 页面"></canvas></div></section>`;
  const canvas = container.querySelector('canvas'), status = container.querySelector('.pdf-status');
  const buttons = [...container.querySelectorAll('button')];
  const task = getDocument({ url, cMapUrl: '/assets/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/assets/pdfjs/standard_fonts/', wasmUrl: '/assets/pdfjs/wasm/', isEvalSupported: false, enableXfa: false });
  function fail(message) { if (disposed) return; status.hidden = false; status.textContent = message; canvas.hidden = true; for (const b of buttons) b.disabled = true; }
  const deadline = setTimeout(() => { fail('PDF 读取超时。可点击“在飞书中查看”继续阅览。'); task.destroy().catch(() => {}); }, 25000);
  async function paint() {
    if (!document || disposed) return;
    const token = ++revision;
    if (render) { render.cancel(); try { await render.promise; } catch {} }
    if (disposed || token !== revision) return;
    status.hidden = false; status.textContent = '正在绘制页面…';
    const page = await document.getPage(pageNumber); if (disposed || token !== revision) return;
    const normal = page.getViewport({ scale: 1 });
    const width = Math.max(120, container.querySelector('.pdf-page').clientWidth - 50);
    const scale = Math.min(width / normal.width * zoom, 4096 / Math.max(normal.width, normal.height));
    const viewport = page.getViewport({ scale });
    const density = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * density); canvas.height = Math.floor(viewport.height * density);
    canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
    canvas.setAttribute('aria-label', `PDF 第 ${pageNumber} 页，共 ${document.numPages} 页`);
    render = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: density === 1 ? null : [density, 0, 0, density, 0, 0] });
    try { await render.promise; } catch (e) { if (e.name === 'RenderingCancelledException') return; throw e; }
    if (disposed || token !== revision) return;
    canvas.hidden = false; status.hidden = true;
    container.querySelector('[data-pdf-pages]').textContent = `${pageNumber} / ${document.numPages} 页`;
    container.querySelector('[data-pdf-prev]').disabled = pageNumber === 1;
    container.querySelector('[data-pdf-next]').disabled = pageNumber === document.numPages;
    container.querySelector('[data-pdf-minus]').disabled = zoom <= .6;
    container.querySelector('[data-pdf-plus]').disabled = zoom >= 2.4;
  }
  container.addEventListener('click', event => {
    const b = event.target.closest('button'); if (!b || b.disabled || !document) return;
    if (b.hasAttribute('data-pdf-prev')) pageNumber = Math.max(1, pageNumber - 1);
    if (b.hasAttribute('data-pdf-next')) pageNumber = Math.min(document.numPages, pageNumber + 1);
    if (b.hasAttribute('data-pdf-minus')) zoom = Math.max(.6, zoom - .2);
    if (b.hasAttribute('data-pdf-plus')) zoom = Math.min(2.4, zoom + .2);
    paint().catch(() => fail('PDF 绘制失败。可点击“在飞书中查看”继续阅览。'));
  });
  let resizeTimer;
  const observer = new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => paint().catch(() => fail('PDF 绘制失败。可点击“在飞书中查看”继续阅览。')), 120); });
  observer.observe(container);
  task.promise.then(async doc => { clearTimeout(deadline); if (disposed) { await doc.destroy(); return; } document = doc; await paint(); }).catch(() => { clearTimeout(deadline); fail('PDF 读取失败。可点击“在飞书中查看”继续阅览。'); });
  return () => { disposed = true; revision++; clearTimeout(deadline); clearTimeout(resizeTimer); observer.disconnect(); render?.cancel(); task.destroy().catch(() => {}); };
}

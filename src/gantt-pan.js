export function attachGanttPan(main) {
  let drag = null, suppressClickUntil = 0;
  main.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || event.button !== 0 || !event.isPrimary || !event.target.closest('.gantt-axis,.gantt-track')) return;
    if (event.clientX < main.querySelector('.gantt-table-head').getBoundingClientRect().right) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: main.scrollLeft, moved: false };
  });
  main.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const delta = event.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(delta) < 6) return;
      if (Math.abs(event.clientY - drag.y) > Math.abs(delta)) { drag = null; return; }
      drag.moved = true; main.classList.add('is-panning'); main.setPointerCapture(event.pointerId);
      document.getSelection()?.removeAllRanges();
    }
    event.preventDefault(); main.scrollLeft = drag.left - delta;
  });
  const finish = event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.moved) suppressClickUntil = performance.now() + 400;
    drag = null; main.classList.remove('is-panning');
    if (main.hasPointerCapture(event.pointerId)) main.releasePointerCapture(event.pointerId);
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) main.addEventListener(type, finish);
  main.addEventListener('pointerleave', event => { if (drag && !drag.moved) finish(event); });
  main.addEventListener('click', event => {
    if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); suppressClickUntil = 0; }
  }, true);
  main.addEventListener('dragstart', event => { if (event.target.closest('.gantt-axis,.gantt-track')) event.preventDefault(); });
}

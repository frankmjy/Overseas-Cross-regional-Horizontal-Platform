import test from 'node:test';
import assert from 'node:assert/strict';
import { todayMarker, centeredTimelineScroll } from '../src/gantt-today.js';

test('today centers in the timeline viewport excluding frozen task columns', () => {
  const left = centeredTimelineScroll({ offset: 146.5, dayWidth: 4.5, viewportWidth: 1580, frozenWidth: 576, scrollWidth: 2200 });
  assert.equal(576 + 146.5 * 4.5 - left, 576 + (1580 - 576) / 2);
  assert.equal(centeredTimelineScroll({ offset: 0, dayWidth: 4.5, viewportWidth: 1000, frozenWidth: 500, scrollWidth: 1800 }), 0);
});

test('today uses the platform civil date, full month axis and fractional time', () => {
  const morning = todayMarker('2026-06-15', '2027-09-30', new Date('2026-10-24T16:00:00Z'));
  assert.equal(morning.date, '2026-10-25'); assert.equal(morning.offset, 146);
  const noon = todayMarker('2026-06-15', '2027-09-30', new Date('2026-10-25T04:00:00Z'));
  assert.equal(noon.offset - morning.offset, .5);
});
test('today moves across midnight and stays hidden outside the axis or without real dates', () => {
  const before = todayMarker('2026-10-01', '2026-10-31', new Date('2026-10-25T15:59:00Z'));
  const after = todayMarker('2026-10-01', '2026-10-31', new Date('2026-10-25T16:00:00Z'));
  assert.equal(after.date, '2026-10-26'); assert.ok(after.offset > before.offset);
  assert.equal(todayMarker('', '', new Date()), null);
  assert.equal(todayMarker('2026-10-01', '2026-10-31', new Date('2027-01-01T00:00:00Z')), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPlatformHeader } from '../src/platform-navigation.js';

test('both workspaces expose the same same-origin navigation with one active page', () => {
  for (const active of ['projects', 'research', 'knowledge']) {
    const header = renderPlatformHeader(active);
    assert.match(header, /href="\/project-management"/);
    assert.match(header, /href="\/"/);
    assert.match(header, /href="\/knowledge-sharing"/);
    assert.equal((header.match(/aria-current="page"/g) || []).length, 1);
    const href = active === 'projects' ? '/project-management' : active === 'knowledge' ? '/knowledge-sharing' : '/';
    assert.ok(header.includes(`href="${href}" aria-current="page"`));
    assert.doesNotMatch(header, /localhost|127\.0\.0\.1|target=/);
    assert.match(header, />应用配置<\/button>/);
  }
});

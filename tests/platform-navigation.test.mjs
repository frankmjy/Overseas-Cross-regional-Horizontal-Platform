import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../src/platform-navigation.js',import.meta.url),'utf8').replace(/^import .+;\r?$/gm,'').replace('export function','function'),context);
const {renderPlatformHeader}=context;

test('both workspaces expose the same same-origin navigation with one active page', () => {
  for (const active of ['projects', 'research', 'coordination', 'knowledge', 'meetings']) {
    const header = renderPlatformHeader(active);
    assert.match(header, /href="\/project-management"/);
    assert.match(header, /href="\/research"/);
    assert.match(header, /href="\/knowledge-sharing"/);
    assert.match(header, /href="\/meeting-trail"/);
    assert.match(header, /href="\/cross-coordination"/);
    assert.equal((header.match(/aria-current="page"/g) || []).length, 1);
    const href = active === 'projects' ? '/project-management' : active === 'coordination' ? '/cross-coordination' : active === 'knowledge' ? '/knowledge-sharing' : active === 'meetings' ? '/meeting-trail' : '/research';
    assert.ok(header.includes(`href="${href}" aria-current="page"`));
    assert.doesNotMatch(header, /localhost|127\.0\.0\.1|target=/);
    assert.match(header, /<platform-account><\/platform-account>/);
  }
});

test('横向统筹在顶栏展开实际页面菜单',()=>{const header=renderPlatformHeader('coordination');assert.match(header,/<details class="platform-coordination"/);assert.match(header,/<summary[^>]*>[\s\S]*?横向统筹/);assert.match(header,/href="\/cross-coordination" aria-current="page"/);assert.match(header,/href="\/staffing-reserve"/);});

test('调研工作台仅在横向统筹菜单中显示并保持当前页标记',()=>{
  const header=renderPlatformHeader('research');
  const menu=header.match(/<details class="platform-coordination">[\s\S]*?<\/details>/)?.[0];
  assert.ok(menu);assert.match(menu,/href="\/research" aria-current="page">调研工作台<\/a>/);
  assert.doesNotMatch(header.replace(menu,''),/调研工作台|href="\/research"/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../src/platform-navigation.js',import.meta.url),'utf8').replace(/^import .+;\r?$/gm,'').replace('export function','function'),context);
const {renderPlatformHeader}=context;

test('登录后的顶栏只显示头像，展开菜单仍可查看完整姓名', () => {
  let Account;
  const accountContext = vm.createContext({
    HTMLElement: class {},
    customElements: {get() {}, define(_name, component) { Account = component; }},
    document: {addEventListener() {}},
    addEventListener() {},
    applyPagePermissions() {},
    readPlatformSession() {},
    location: {pathname: '/project-management', search: '', hash: ''},
  });
  const source = fs.readFileSync(new URL('../src/platform-account.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace(/^import .+;\r?$/gm, ''), accountContext);
  const account = new Account();
  account.isConnected = true;
  account.querySelector = () => ({addEventListener() {}});
  account.draw({authenticated: true, user: {name: '马进宇'}, project: {name: '泰国 Araya'}});
  const trigger = account.innerHTML.match(/<summary([^>]*)>(.*?)<\/summary>/);
  assert.ok(trigger);
  assert.match(trigger[1], /aria-label="马进宇，打开用户菜单"/);
  assert.match(trigger[1], /title="马进宇"/);
  assert.equal(trigger[2].replace(/<[^>]+>/g, ''), '进宇');
  assert.match(account.innerHTML, /<strong>马进宇<\/strong>/);
  account.draw({authenticated: true, preview: true, user: {name: '本地预览'}, project: {name: '泰国 Araya'}});
  assert.match(account.innerHTML, /只读数据快照/);
  assert.match(account.innerHTML, /href="\/login".*返回登录页/);
  assert.doesNotMatch(account.innerHTML, /data-account-logout|切换飞书账号/);
});

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

test('接维工作台的模块链接复用当前标签页及既有路由',()=>{
  const html=fs.readFileSync(new URL('../samples/handover-preview/index.html',import.meta.url),'utf8');
  const links=[...html.matchAll(/<a\s+data-platform-page\s+href="([^"]+)"([^>]*)>/g)];
  assert.deepEqual(links.map(([,url])=>url),['/cross-coordination?project=th-001','/knowledge-sharing?project=thailand','/meeting-trail?project=thailand']);
  for(const [,,attributes] of links){
    assert.doesNotMatch(attributes,/\btarget\s*=/i);
  }
});

import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const file='research/web/app.mjs';let code=await fs.readFile(file,'utf8');
const replacements=[
 ['<label>调研问题<textarea name="title"','${renderScopeField()}<label>调研问题<textarea name="title"'],
 ['<strong>${esc(q.title)}</strong>${syncBadge(q.sync)}','<strong>${esc(q.title)}${q.applicability === \'通用\' ? \'<span class="applicability-tag">通用</span>\' : \'\'}</strong>${syncBadge(q.sync)}'],
];
for(const [index,[before,after]]of replacements.entries()){assert.equal(code.split(before).length,index===0?2:3,`Unexpected UI patch anchor count ${before}`);code=code.replaceAll(before,after);}
await fs.writeFile(file,code);

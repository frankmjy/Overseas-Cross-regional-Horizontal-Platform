import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {HandoverAdapter} from '../project-tasks/handover/adapter.mjs';
import {binding} from '../project-tasks/handover/model.mjs';

test('身份检查兼容随包CLI的默认JSON输出，不传不受支持的--json参数',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'handover-cli-compat-')),script=path.join(dir,'cli.cjs');
 fs.writeFileSync(script,`if(JSON.stringify(process.argv.slice(2))!==JSON.stringify(['auth','status']))process.exit(2);console.log(JSON.stringify({appId:${JSON.stringify(binding.appId)}}));`);
 const old={script:process.env.LARK_CLI_SCRIPT,appId:process.env.FEISHU_APP_ID};process.env.LARK_CLI_SCRIPT=script;process.env.FEISHU_APP_ID=binding.appId;
 t.after(()=>{if(old.script===undefined)delete process.env.LARK_CLI_SCRIPT;else process.env.LARK_CLI_SCRIPT=old.script;if(old.appId===undefined)delete process.env.FEISHU_APP_ID;else process.env.FEISHU_APP_ID=old.appId;assert(dir.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true});});
 const adapter=new HandoverAdapter();await adapter.assertIdentity();assert.ok(adapter.checkedAt);
});

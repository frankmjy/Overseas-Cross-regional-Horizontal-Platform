import fs from 'node:fs/promises';
import path from 'node:path';
import {BaseAdapter} from '../research/adapter.mjs';
process.env.LARK_CLI_SCRIPT=path.resolve('.tmp/lark-cli-1.0.98/package/scripts/run.js');
const state=JSON.parse(await fs.readFile('reports/source-references-20261018/migration-ledger.json','utf8'));
const api=new BaseAdapter({baseToken:state.target});
const results=await Promise.allSettled([
  api.cli('+base-block-list',['--format','json']),
  api.cli('+form-questions-list',['--table-id','tblCTyrV3BYSZkTv','--form-id','vewoWIPzBR','--format','json']),
]);
for(let i=0;i<results.length;i++){
 const r=results[i];if(r.status==='rejected'){console.log(JSON.stringify({i,error:r.reason.message}));continue;}
 await fs.writeFile(`reports/source-references-20261018/current-${i}.json`,JSON.stringify(r.value,null,2));
 console.log(JSON.stringify({i,keys:Object.keys(r.value),preview:i===0?r.value.blocks?.slice(0,3):r.value}));
}

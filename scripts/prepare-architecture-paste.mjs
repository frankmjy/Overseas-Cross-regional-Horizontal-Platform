import fs from 'node:fs/promises';
import {BaseAdapter} from '../research/adapter.mjs';
const dir='reports/project-cleanup-20261018';
const api=new BaseAdapter({baseToken:'CID8b8V7CaCtKesWGFKcHTdqnlc'});
const before=await api.cli('+fetch',['--doc','VDQgdT3wyoWKElxmvFcclf6bnnK','--api-version','v2'],process.cwd(),'docs');
await fs.writeFile(dir+'/architecture-before-launchpad.json',JSON.stringify(before,null,2));
let html=await fs.readFile(dir+'/architecture-guide.html','utf8');
// Keep images separate; the native paste bridge cannot accept a large inline image payload.
await fs.writeFile(dir+'/architecture-guide-paste.html',html);
console.log(JSON.stringify({backup:true,separateImages:3,links:(html.match(/\?table=/g)||[]).length,characters:html.length}));

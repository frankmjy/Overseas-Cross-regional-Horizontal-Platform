import fs from 'node:fs';
const binding=JSON.parse(fs.readFileSync(new URL('./application.json',import.meta.url),'utf8'));
export const isAdministrator=(user,appId)=>appId===binding.appId&&user?.openId===binding.recipient;

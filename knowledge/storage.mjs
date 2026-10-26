import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export const failure=(message,status=400)=>Object.assign(new Error(message),{status});
export function saveJson(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true});const temp=`${file}.${randomUUID()}.tmp`;
 try{const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);}
 catch(error){if(fs.existsSync(temp))fs.unlinkSync(temp);throw failure('资料未保存，请检查服务器存储后重试。',503);}
}
export function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw Error('会议台账无法读取，请保留原文件并恢复备份。');}}
export function lockWriter(file){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 if(fs.existsSync(file)){const pid=Number(fs.readFileSync(file,'utf8'));if(!Number.isInteger(pid)||pid<1)throw Error('会议写入锁不完整，请核对运行进程。');try{process.kill(pid,0);throw Error('已有进程管理会议同步，禁止重复启动。');}catch(e){if(e.code!=='ESRCH')throw e;}fs.unlinkSync(file);}
 const fd=fs.openSync(file,'wx',0o600);fs.writeFileSync(fd,String(process.pid));fs.closeSync(fd);
 return ()=>{if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===String(process.pid))fs.unlinkSync(file);};
}

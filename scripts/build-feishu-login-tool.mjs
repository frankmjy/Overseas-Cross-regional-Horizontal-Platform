import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ps=fs.readFileSync(path.join(root,'scripts/feishu-login-tool.ps1'),'utf8');
const node=fs.readFileSync(path.join(root,'scripts/feishu-login-tool.mjs'),'utf8');
const header=`@echo off
setlocal
set "VNET_CONFIG_TOOL_FILE=%~f0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:VNET_CONFIG_TOOL_FILE,[Text.Encoding]::UTF8); $a=$t.IndexOf('# VNET_PS_SOURCE'+[char]13+[char]10); $b=$t.IndexOf('# VNET_NODE_SOURCE'+[char]13+[char]10); if($a -lt 0 -or $b -lt $a){exit 1}; . ([ScriptBlock]::Create($t.Substring($a+18,$b-$a-18))); exit (Invoke-FeishuLoginTool -ToolFile $env:VNET_CONFIG_TOOL_FILE)"
set "VNET_CONFIG_RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %VNET_CONFIG_RESULT%
# VNET_PS_SOURCE
`;
const output=(header+ps+'\n# VNET_NODE_SOURCE\n'+node).replace(/\r?\n/g,'\r\n');
fs.writeFileSync(path.join(root,'configure-feishu-login.bat'),output,'utf8');
console.log('configure-feishu-login.bat generated (standalone, no credentials).');

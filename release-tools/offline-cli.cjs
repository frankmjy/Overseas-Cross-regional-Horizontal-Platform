// Isolated native exercises must never call the real Feishu application.
process.stdout.write(JSON.stringify({ok:false,error:{code:'RELEASE_OFFLINE',message:'External calls are disabled in this isolated exercise.'}}));
process.exitCode=1;

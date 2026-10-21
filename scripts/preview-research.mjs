// Keep the old preview command on the same routes and runtime as the full platform.
process.env.PORT ||= '4174';
process.env.SERVER_HOST = '127.0.0.1';
await import('../server.mjs');

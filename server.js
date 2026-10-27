'use strict';
// Placement Management System (PMS) - demo server. Zero npm dependencies; needs Node.js >= 22.13.
const http = require('node:http');
const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;
const app = createApp();
const server = http.createServer(app.handle);

server.listen(PORT, () => {
  console.log('');
  console.log('  Placement Management System (PMS) - Team T061, CS314');
  console.log(`  Web client : http://localhost:${PORT}`);
  console.log(`  REST API   : http://localhost:${PORT}/api/health`);
  console.log('  Demo logins are listed on the login page. Press Ctrl+C to stop.');
  console.log('');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { console.log('\nShutting down.'); server.close(() => { try { app.db.close(); } catch (_) {} process.exit(0); }); });
}

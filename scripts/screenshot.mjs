import http from 'node:http';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';
import WebSocket from 'ws';

const TARGET = process.argv[2];
const OUT = process.argv[3];
const COOKIE_VALUE = process.argv[4];
mkdirSync('/tmp/vp-screenshots', { recursive: true });

// 1. Start chrome with remote debugging
const userData = `/tmp/chrome-cdp-${Date.now()}`;
const child = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--window-size=1280,900',
  '--hide-scrollbars',
  `--user-data-dir=${userData}`,
  '--remote-debugging-port=9222',
  'about:blank',
], { stdio: 'ignore' });

await wait(1500);

// 2. Get list of pages
const targets = await new Promise((res, rej) => {
  http.get('http://localhost:9222/json', (r) => {
    let data = '';
    r.on('data', (d) => (data += d));
    r.on('end', () => res(JSON.parse(data)));
    r.on('error', rej);
  });
});
const page = targets[0];

// 3. Connect WS
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.on('message', (msg) => {
  const m = JSON.parse(msg);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
});
const send = (method, params) => new Promise((res) => {
  const i = ++id;
  pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});
await new Promise((res) => ws.once('open', res));

// 4. Set cookie
await send('Network.enable');
await send('Network.setCookie', {
  name: 'vp_session',
  value: COOKIE_VALUE,
  domain: 'localhost',
  path: '/',
});

// 5. Navigate
await send('Page.enable');
await send('Page.navigate', { url: TARGET });
await wait(4000);

// 6. Screenshot
const result = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(result.data, 'base64'));

ws.close();
child.kill('SIGKILL');
console.log(`Saved: ${OUT} (${Buffer.from(result.data, 'base64').length} bytes)`);

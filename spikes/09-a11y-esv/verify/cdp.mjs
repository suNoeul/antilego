// 기존 CDP 드라이버 재사용 + 모든 외부 요청 로컬 대체. 라이브 API 호출 금지.
import * as base from '../../08-versions/verify/cdp.mjs';
import { basename, join } from 'node:path';
export { evalJs, clickSel, tapSel, metrics, goTo, sleep, type } from '../../08-versions/verify/cdp.mjs';

const mocks = new WeakMap();
export async function connect() {
  const cdp = await base.connect(Number(process.env.CDP_PORT || 9222));
  mocks.set(cdp, []);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await cdp.send('Storage.clearDataForOrigin', { origin: 'http://127.0.0.1:8765', storageTypes: 'all' });
  cdp.on(async m => {
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params;
    const mock = mocks.get(cdp).find(x => x.pattern.test(request.url));
    const url = new URL(request.url);
    let reply = mock ? mock.reply(request) : null;
    if (!reply && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      // 폰트는 빈 CSS, API는 명시적인 가짜 응답. 네트워크로 나가지 않는다.
      reply = { status: 200, body: url.pathname.includes('/api/')
        ? { ok: false, error: 'no_key' } : '', type: 'text/css' };
    }
    if (!reply) { await cdp.send('Fetch.continueRequest', { requestId }); return; }
    const body = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? {});
    await cdp.send('Fetch.fulfillRequest', { requestId, responseCode: reply.status ?? 200,
      responseHeaders: [
        { name: 'Content-Type', value: reply.type || 'application/json' },
        { name: 'Access-Control-Allow-Origin', value: '*' },
        { name: 'Cache-Control', value: 'no-store' },
      ], body: Buffer.from(body).toString('base64') });
  });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  return cdp;
}

export async function mockFetch(cdp, match, reply) {
  const pattern = new RegExp('^' + match.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  mocks.get(cdp).unshift({ pattern, reply });
}
export async function clearMocks(cdp) { mocks.set(cdp, []); }
export async function shot(cdp, path) {
  if (process.env.SHOTS_DIR) await base.shot(cdp, join(process.env.SHOTS_DIR, basename(path)));
}
export async function key(cdp, key, shift = false) {
  const code = { Enter: 13, Escape: 27, Tab: 9, ArrowLeft: 37, ArrowUp: 38,
    ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35, ' ': 32 }[key];
  const data = { key, code: key === ' ' ? 'Space' : key, windowsVirtualKeyCode: code,
    modifiers: shift ? 8 : 0 };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...data });
  if (key === 'Enter' || key === ' ') await cdp.send('Input.dispatchKeyEvent', {
    type: 'char', ...data, text: key === 'Enter' ? '\r' : ' ' });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...data });
  await base.sleep(80);
}

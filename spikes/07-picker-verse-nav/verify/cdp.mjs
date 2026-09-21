// 얇은 CDP 드라이버. Node 내장 WebSocket 만 쓴다 (의존성 없음).
import { writeFileSync, mkdirSync } from 'node:fs';

export async function connect(port = 9222) {
  let list;
  for (let i = 0; i < 60; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); break; }
    catch { await new Promise(r => setTimeout(r, 250)); }
  }
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  const events = [];
  const handlers = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id != null) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error(JSON.stringify(m.error))); else p.res(m.result);
    } else {
      events.push(m);
      for (const h of handlers) h(m);
    }
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const myId = ++id;
    pending.set(myId, { res, rej });
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  return { send, events, on: h => handlers.push(h), close: () => ws.close() };
}

export async function evalJs(cdp, expr) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: `(async () => { ${expr} })()`,
    awaitPromise: true, returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
  return r.result.value;
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// 실제 마우스 클릭 (요소 가운데)
export async function clickSel(cdp, sel, nth = 0) {
  const box = await evalJs(cdp, `
    const els = document.querySelectorAll(${JSON.stringify(sel)});
    const el = els[${nth}];
    if (!el) return null;
    el.scrollIntoView({block:'nearest'});
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };`);
  if (!box) throw new Error('no element: ' + sel + ' #' + nth);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', {
      type, x: box.x, y: box.y, button: 'left', clickCount: 1,
    });
  }
  await sleep(120);
}

export async function tapSel(cdp, sel, nth = 0) { return clickSel(cdp, sel, nth); }

export async function key(cdp, k) {
  const map = {
    Enter: { windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter', text: '\r' },
    Escape: { windowsVirtualKeyCode: 27, key: 'Escape', code: 'Escape' },
    Tab: { windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' },
    ArrowDown: { windowsVirtualKeyCode: 40, key: 'ArrowDown', code: 'ArrowDown' },
    ArrowUp: { windowsVirtualKeyCode: 38, key: 'ArrowUp', code: 'ArrowUp' },
  };
  const d = map[k];
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...d });
  if (d.text) await cdp.send('Input.dispatchKeyEvent', { type: 'char', ...d });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...d });
  await sleep(120);
}

export async function type(cdp, text) {
  for (const ch of text) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, unmodifiedText: ch, key: ch });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    await sleep(25);
  }
  await sleep(150);
}

export async function shot(cdp, path) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  mkdirSync(path.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(path, Buffer.from(r.data, 'base64'));
}

export async function metrics(cdp, { width, height, mobile }) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: !!mobile,
    screenWidth: width, screenHeight: height,
  });
  if (mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  else await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
}

export async function goTo(cdp, url) {
  await cdp.send('Page.navigate', { url });
  await sleep(900);
}

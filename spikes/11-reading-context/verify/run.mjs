// 기본 검사는 로컬/CI 공통이며 외부망 없이 전용 브라우저에서 실행한다.
// node spikes/11-reading-context/verify/run.mjs [--unit | --terrain]
// --terrain은 실제 DEM을 사용하는 별도 지형 회귀 검사(인터넷 필요)다.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as tcpServer } from 'node:net';
import { readFile, readdir, access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url)), web = join(root, 'web');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function run(file, args = [], env = process.env) {
  console.log(`\nCHECK ${file} ${args.join(' ')}`);
  const child = spawn(file === 'ruby' ? 'ruby' : process.execPath, file === 'ruby' ? args : [file, ...args], { cwd: root, stdio: 'inherit', env });
  const timer = setTimeout(() => child.kill('SIGKILL'), 360000);
  try {
    await new Promise((done, fail) => { child.once('error', fail); child.once('exit', code => code === 0 ? done() : fail(new Error(`${file} exited ${code}`))); });
  } finally { clearTimeout(timer); }
}
for (const file of (await readdir(web)).filter(f => f.endsWith('.js'))) await run('--check', ['web/' + file]);
for (const file of ['spikes/06-review-fixes/b-nav-test.mjs', 'spikes/09-a11y-esv/verify/map.mjs',
  'spikes/10-terrain/verify/unit.mjs', 'spikes/10-terrain/verify/context-unit.mjs',
  'spikes/11-reading-context/verify/unit.mjs']) await run(file);
await run('spikes/11-reading-context/build.mjs', ['--check']);
await run('ruby', ['spikes/09-a11y-esv/verify/ci.rb']);
if (process.argv.includes('--unit')) process.exit(0);

let server, chrome, profile;
try {
  // 8765에서 이미 실행 중인 로컬 미리보기는 파일이 같은 경우에만 재사용하고 종료하지 않는다.
  const existing = await fetch('http://127.0.0.1:8765/app.js', { signal: AbortSignal.timeout(1000) }).catch(() => null);
  if (existing) {
    if (await existing.text() !== await readFile(join(web, 'app.js'), 'utf8')) throw new Error('8765 포트에 다른 프로젝트가 실행 중입니다.');
  } else {
    server = createServer(async (req, res) => {
      try {
        const path = resolve(web, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
        if (path !== web && !path.startsWith(web + sep)) { res.writeHead(403).end(); return; }
        const target = path === web ? join(web, 'index.html') : path;
        const body = await readFile(target);
        res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[extname(target)] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store'); res.end(body);
      } catch { res.writeHead(404).end(); }
    });
    await new Promise((done, fail) => { server.once('error', fail); server.listen(8765, '127.0.0.1', done); });
  }
  const candidates = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  let executable;
  for (const path of candidates) { try { await access(path); executable = path; break; } catch {} }
  if (!executable) throw new Error('Chrome 실행 파일이 필요합니다. CHROME_BIN으로 지정할 수 있습니다.');
  const socket = tcpServer();
  await new Promise(done => socket.listen(0, '127.0.0.1', done));
  const port = socket.address().port; await new Promise(done => socket.close(done));
  profile = await mkdtemp(join(tmpdir(), 'antilego-check-'));
  chrome = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let launchError; chrome.on('error', e => { launchError = e; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (launchError) throw launchError;
    if (chrome.exitCode != null) throw new Error('전용 Chrome 실행 실패');
    if (await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.ok).catch(() => false)) { ready = true; break; }
    await sleep(100);
  }
  if (!ready) throw new Error('전용 Chrome 준비 시간 초과');
  const env = { ...process.env, CDP_PORT: String(port) };
  if (process.argv.includes('--terrain')) {
    for (const suite of ['comparison', 'browser', 'context-browser']) await run(`spikes/10-terrain/verify/${suite}.mjs`, [], env);
  } else {
    await run('spikes/11-reading-context/verify/browser.mjs', [], env);
    await run('spikes/09-a11y-esv/verify/accessibility.mjs', [], env);
    await run('spikes/09-a11y-esv/verify/regression.mjs', [], env);
  }
  console.log('\nAll pre-deploy checks passed.');
} finally {
  if (chrome && chrome.exitCode == null) {
    chrome.kill();
    await Promise.race([new Promise(done => chrome.once('exit', done)), sleep(3000)]);
    if (chrome.exitCode == null) chrome.kill('SIGKILL');
  }
  if (server) await new Promise(done => server.close(done));
  // 이 실행에서 생성한 검증 전용 임시 프로필만 정리한다.
  if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}

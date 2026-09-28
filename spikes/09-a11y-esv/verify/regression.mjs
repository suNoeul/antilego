// 07/08의 기존 단언을 그대로 실행하되 CDP 드라이버만 외부 요청 차단 버전으로 교체한다.
// 과거 스크린샷은 덮지 않는다. SHOTS_DIR 지정 시 그 위치에만 새로 저장한다.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = process.argv.slice(2);
const suites = files.length ? files : [
  '07-picker-verse-nav/verify/desktop.mjs', '07-picker-verse-nav/verify/mobile.mjs',
  '07-picker-verse-nav/verify/fetchfail.mjs', '08-versions/verify/desktop.mjs',
  '08-versions/verify/esv.mjs', '08-versions/verify/legacy.mjs',
  '08-versions/verify/real.mjs', '08-versions/verify/mobile.mjs',
];
let failures = 0;
for (const suite of suites) {
  const source = readFileSync(new URL('../../' + suite, import.meta.url), 'utf8')
    .replace("'./cdp.mjs'", JSON.stringify(new URL('./cdp.mjs', import.meta.url).href))
    .replace("new URL('../shots', import.meta.url).pathname", "'unused-shots'");
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', timeout: 120000 });
  const out = r.stdout || '';
  const passed = (out.match(/^PASS \|/gm) || []).length;
  const bad = out.split('\n').filter(l => /^FAIL \||^console.error|^FAILS:|^  /.test(l));
  const failed = r.status !== 0 || !out.includes('FAILS: 0') || /^FAIL \|/m.test(out);
  if (failed) failures++;
  console.log(`${suite}: ${passed} PASS${failed ? ' — FAILED' : ''}\n${bad.join('\n')}`);
  if (r.stderr) console.log(r.stderr);
}
process.exitCode = failures ? 1 : 0;

// F14 경계 확인: document가 없는 Node에서 순수 계산 네 API를 사용한다.
import assert from 'node:assert/strict';
import { sceneFrame, frameBounds, clampView, zoomAt } from '../../../web/map.js';
let assertions = 0;
const eq = (a, b) => { assert.deepEqual(a, b); assertions++; };
eq(typeof globalThis.document, 'undefined');
const scene = { focus: ['a'], others: ['b'], places: {
  a: { lat: 31.8, lon: 35.2 }, b: { lat: 32.1, lon: 34.9 },
} };
const original = JSON.stringify(scene);
const frame = sceneFrame(scene, 640, 480);
eq([frame.W, frame.H, frame.shown], [640, 480, ['a', 'b']]);
eq(JSON.stringify(scene), original);
const bounds = frameBounds(frame, { bbox: [8, 24, 50, 43] });
eq([bounds.W, bounds.H], [640, 480]);
eq(clampView({ z: 100, px: 0, py: 0 }, bounds).z, 8);
eq(clampView({ z: 0.5, px: 0, py: 0 }, bounds).z, 1);
const view = { z: 1, px: 0, py: 0 };
const zoom = zoomAt(view, 320, 240, 2, bounds);
eq([zoom.z, (320 - zoom.px) / zoom.z, (240 - zoom.py) / zoom.z], [2, 320, 240]);
eq(view, { z: 1, px: 0, py: 0 });
console.log(`map: ${assertions} PASS; DOM 없이 계산, 입력 불변, 배율 제한, 줌 중심 유지`);

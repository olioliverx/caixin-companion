import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupTabs, markedUrl } from '../src/jobs.js';
import { saveBlob, collectImages, LIMITS } from '../src/export.js';
import { readBounded } from '../src/network.js';

function event() { const handlers = []; return { handlers, addListener: fn => handlers.push(fn) }; }
function area(state = {}) { return { state, get: async key => ({ [key]: structuredClone(state[key]) }), set: async value => Object.assign(state, structuredClone(value)), remove: async key => delete state[key], setAccessLevel: async () => {} }; }
function mock() {
  const tabs = new Map([[1, { id: 1, url: 'https://weekly.caixin.com/2026/cw1223/' }]]);
  const downloads = new Map(); let next = 10;
  const local = area(), session = area();
  const chrome = { runtime: { id: 'test-extension', getURL: path => `chrome-extension://test-extension/${path.replace(/^\//, '')}`, getContexts: async filter => [...tabs.values()].filter(tab => !filter.documentUrls || filter.documentUrls.includes(tab.url)).map(tab => ({ tabId: tab.id, documentUrl: tab.url })), onMessage: event(), onStartup: event() }, storage: { local, session },
    tabs: { onRemoved: event(), onUpdated: event(), query: async () => [...tabs.values()], get: async id => { if (!tabs.has(id)) throw new Error('missing'); return tabs.get(id); },
      create: async options => { const tab = { ...options, id: next++ }; tabs.set(tab.id, tab); return tab; },
      update: async (id, options) => { Object.assign(tabs.get(id), options); return tabs.get(id); }, remove: async id => { tabs.delete(id); } },
    downloads: { onCreated: event(), search: async ({ id }) => downloads.has(id) ? [downloads.get(id)] : [], cancel: async id => { downloads.get(id).state = 'interrupted'; } }
  };
  const popup = { id: chrome.runtime.id, url: chrome.runtime.getURL('src/popup.html'), documentId: 'popup' };
  return { chrome, tabs, downloads, local, session, popup };
}
let instance = 0;
async function load(m) {
  globalThis.chrome = m.chrome;
  m.chrome.runtime.onMessage = event();
  await import(`../src/background.js?instance=${++instance}`);
  return (message, sender = m.popup) => new Promise(resolve => m.chrome.runtime.onMessage.handlers[0](message, sender, resolve));
}
async function start(m, send) {
  const { job } = await send({ type: 'startExport', sourceTabId: 1 });
  const owner = { id: m.chrome.runtime.id, tab: { id: job.taskTabId }, documentId: 'task-doc', url: m.chrome.runtime.getURL(`src/task.html?job=${job.id}`) };
  assert.ok((await send({ type: 'claimJob', id: job.id }, owner)).sourceTabId);
  return { job, owner, task: message => send({ ...message, id: job.id }, owner) };
}

test('coordinator excludes duplicate starts, survives popup closure and worker restart without stopping a live task', async () => {
  const m = mock(); let send = await load(m);
  const [first, duplicate] = await Promise.all([send({ type: 'startExport', sourceTabId: 1 }), send({ type: 'startExport', sourceTabId: 1 })]);
  assert.equal(first.job.id, duplicate.job.id); assert.equal(m.tabs.size, 2);
  const job = first.job;
  const owner = { id: m.chrome.runtime.id, tab: { id: job.taskTabId }, documentId: 'document', url: m.chrome.runtime.getURL(`src/task.html?job=${job.id}`) };
  await send({ type: 'claimJob', id: job.id }, owner);
  // There are no popup ports or in-worker export loops to keep alive.
  send = await load(m);
  assert.equal((await send({ type: 'getState' })).job.phase, 'discovery');
  assert.equal((await send({ type: 'progress', id: job.id, phase: 'reading', text: 'reading', percent: 5 }, owner)).cancelled, false);
  const badOwner = { ...owner, documentId: 'other-document' };
  assert.match((await send({ type: 'progress', id: job.id, phase: 'reading' }, badOwner)).error, /中断/);
});

test('task closure fails explicitly and cleans owned tabs; reloaded task cannot resume uncached bodies', async () => {
  const m = mock(), send = await load(m); const { job, owner, task } = await start(m, send);
  const { tabId } = await task({ type: 'openArticle', url: 'https://weekly.caixin.com/2026-09-12/123.html' });
  assert.ok(m.tabs.has(tabId));
  m.tabs.delete(job.taskTabId);
  const recovered = await send({ type: 'getState' });
  assert.equal(recovered.job.phase, 'failed'); assert.equal(m.tabs.has(tabId), false); assert.ok(m.tabs.has(1));
  const next = await start(m, send);
  const result = await send({ type: 'claimJob', id: next.job.id }, { ...next.owner, documentId: 'reloaded' });
  assert.match(result.error, /重新加载/); assert.equal(m.local.state.exportJob.phase, 'failed');
});

test('browser restart only cleans marked restored tabs, never a reused unmarked ID', async () => {
  const m = mock(); globalThis.chrome = m.chrome;
  m.tabs.set(22, { id: 22, url: 'https://example.org/user-tab' });
  m.tabs.set(23, { id: 23, url: markedUrl('https://weekly.caixin.com/2026-09-12/123.html', 'job-one') });
  await cleanupTabs({ id: 'job-one', bootId: 'previous-boot', tempTabIds: [22] }, 'new-boot');
  assert.ok(m.tabs.has(22)); assert.equal(m.tabs.has(23), false);
});

test('saved download is recovered after task interruption; incomplete save is cancelled and never announced complete', async () => {
  for (const downloadState of ['complete', 'in_progress']) {
    const m = mock(), send = await load(m); const { job, task } = await start(m, send);
    const url = 'blob:chrome-extension://test-extension/file';
    await task({ type: 'prepareDownload', url });
    m.downloads.set(9, { id: 9, url, byExtensionId: 'test-extension', state: downloadState });
    await task({ type: 'recordDownload', downloadId: 9 });
    m.tabs.delete(job.taskTabId);
    const { job: recovered } = await send({ type: 'getState' });
    assert.equal(recovered.phase, downloadState === 'complete' ? 'complete' : 'failed');
    if (downloadState !== 'complete') assert.equal(m.downloads.get(9).state, 'interrupted');
  }
});

test('download uses a Blob URL and retains it until browser completion', async t => {
  const original = URL.revokeObjectURL; const revoked = []; URL.revokeObjectURL = value => { revoked.push(value); original(value); };
  t.after(() => { URL.revokeObjectURL = original; });
  const controller = new AbortController(); let checks = 0, downloadUrl;
  globalThis.chrome = { downloads: { download: async ({ url }) => { downloadUrl = url; return 1; }, search: async () => {
    assert.equal(revoked.length, 0); return [{ state: ++checks >= 2 ? 'complete' : 'in_progress' }];
  }, cancel: async () => {} } };
  await saveBlob(new Blob(['synthetic']), 'test.epub', async () => ({}), controller.signal);
  assert.match(downloadUrl, /^blob:/); assert.equal(revoked.length, 1);
});

test('bounded resources cancel declared and streamed oversized bodies', async () => {
  for (const response of [new Response('x'.repeat(11), { headers: { 'content-length': '11' } }), new Response('x'.repeat(11))]) {
    await assert.rejects(readBounded(response, 10), /大小限制/);
  }
  assert.equal((await readBounded(new Response('123'), 3)).length, 3);
});

test('image budget and unsupported image bytes produce explicit warnings without unbounded retention', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  let requests = 0;
  globalThis.fetch = async () => { requests++; const bytes = new Uint8Array(LIMITS.imageBytes); bytes.set([137, 80, 78, 71]); return new Response(bytes, { headers: { 'content-type': 'image/png' } }); };
  const warnings = [], images = Array.from({ length: 12 }, (_, i) => ({ url: `https://img.caixin.com/${i}.png` }));
  const cache = await collectImages({}, [{ images }], async () => {}, warnings, new AbortController().signal);
  assert.equal(cache.size, 5); assert.equal(requests, 5); assert.match(warnings[0], /7 张图片/);
});

test('coordinator refuses premature success and expires terminal metadata on the next request', async () => {
  const m = mock(), send = await load(m); const { task } = await start(m, send);
  assert.match((await task({ type: 'finishJob', phase: 'complete', text: 'saved' })).error, /尚未确认/);
  await task({ type: 'finishJob', phase: 'failed', text: 'synthetic interruption' });
  m.local.state.exportJob.updatedAt = Date.now() - 25 * 60 * 60 * 1000;
  const restarted = await load(m);
  assert.equal((await restarted({ type: 'getState' })).job, null);
  assert.equal(m.local.state.exportJob, undefined);
});

test('cancellation races honor a completed save, while interrupted saves reject', async () => {
  for (const completesDuringCancel of [true, false]) {
    const controller = new AbortController(); let state = 'in_progress';
    globalThis.chrome = { downloads: {
      download: async () => { controller.abort(new DOMException('cancel', 'AbortError')); return 1; },
      search: async () => [{ state }],
      cancel: async () => { state = completesDuringCancel ? 'complete' : 'interrupted'; }
    } };
    const saving = saveBlob(new Blob(['self-authored']), 'fixture.epub', async () => ({}), controller.signal);
    if (completesDuringCancel) await assert.doesNotReject(saving);
    else await assert.rejects(saving, /cancel/);
  }
});


test('image activation is limited to owned article tabs and stops on cancellation', async () => {
  const m = mock(), send = await load(m); const { task } = await start(m, send);
  assert.match((await task({ type: 'activateArticle', tabId: 1 })).error, /本任务/);
  const { tabId } = await task({ type: 'openArticle', url: 'https://weekly.caixin.com/2026-09-12/123.html' });
  assert.equal(m.tabs.get(tabId).active, false);
  assert.equal((await task({ type: 'activateArticle', tabId })).error, undefined);
  assert.equal(m.tabs.get(tabId).active, true);
  await send({ type: 'cancelExport' });
  assert.match((await task({ type: 'activateArticle', tabId })).error, /取消/);
});

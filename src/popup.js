import { detectCaixinPage } from "./detect.js";
import { JOB_KEY, isRunning } from "./jobs.js";
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const titleEl = document.getElementById("issueTitle");
const metaEl = document.getElementById("issueMeta");
const countEl = document.getElementById("articleCount");
const progressWrap = document.getElementById("progressWrap");
const progressEl = document.getElementById("progress");
const progressText = document.getElementById("progressText");
const errorsEl = document.getElementById("errors");
const buttons = {
  epub: document.getElementById("exportEpub")
};

let detected = null;
let sourceTabId = null;
let busy = false;

init().catch((error) => showError(error.message || String(error)));

buttons.epub.addEventListener("click", () => exportFormats(["epub"]));

async function init() {
  await connect();
  const source = new URL(location.href).searchParams.get("sourceTab");
  const tab = source && /^\d+$/.test(source)
    ? await chrome.tabs.get(Number(source))
    : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  sourceTabId = tab?.id;
  document.getElementById("openWorkspace").hidden = !!source;
  if (!tab?.id) throw new Error("没有找到当前标签页。");

  if (!tab.url?.startsWith("https://weekly.caixin.com/")) {
    statusEl.textContent = "请在财新周刊期刊页或文章页打开扩展。";
    return;
  }
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: detectCaixinPage
  });

  detected = result;
  if (detected) detected.tabId = tab.id;
  if (!detected?.ok) {
    statusEl.textContent = detected?.message || "请在财新周刊期刊页或文章页打开扩展。";
    return;
  }

  statusEl.textContent = detected.kind === "issue" ? "检测到期刊页" : "检测到文章页";
  titleEl.textContent = detected.issue.title || detected.article?.title || "财新周刊";
  metaEl.textContent = [detected.issue.number, detected.issue.date].filter(Boolean).join(" · ");
  countEl.textContent = detected.kind === "issue"
    ? `${detected.articles.length} 篇文章`
    : "1 篇文章";
  summaryEl.hidden = false;
  const inventory = detected.inventory || detected.articles.map(item => ({ ...item, status: 'supported' }));
  document.getElementById('inventory').replaceChildren(...inventory.map(item => {
    const li = document.createElement('li'); li.textContent = `${item.section ? item.section + ' · ' : ''}${item.title || item.url}${item.reason ? '：' + item.reason : ''}`; return li;
  }));
  setButtons(true);
}

async function exportFormats() {
  busy = true; setButtons(false); errorsEl.hidden = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "startExport", sourceTabId });
    if (response?.error) throw new Error(response.error);
    renderJob(response.job);
  } catch (error) { busy = false; showError(error.message); setButtons(true); }
}

function renderJob(job) {
  if (!job) return;
  busy = isRunning(job);
  progressWrap.hidden = false;
  progressEl.value = job.percent;
  progressText.textContent = job.phase === "failed" ? "导出未完成" : job.text;
  document.getElementById("cancelExport").hidden = !busy;
  errorsEl.textContent = job.phase === 'failed' ? job.text : '';
  errorsEl.hidden = !errorsEl.textContent;
  const notes = [...new Set(job.warnings || [])];
  document.getElementById('exportNotes').hidden = busy || !notes.length;
  document.getElementById('exportNotesList').replaceChildren(...notes.map(note => {
    const li = document.createElement('li'); li.textContent = note; return li;
  }));
  setButtons(true);
}
async function connect() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[JOB_KEY]) renderJob(changes[JOB_KEY].newValue);
  });
  const state = await chrome.runtime.sendMessage({ type: 'getState' });
  if (state?.error) throw new Error(state.error);
  renderJob(state?.job);
}
document.getElementById("cancelExport").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "cancelExport" });
});

function setButtons(enabled) {
  buttons.epub.disabled = !enabled || busy || !detected?.ok || detected.inventory?.some(item => item.status === 'unsupported');
}

function showError(message) {
  errorsEl.textContent = message;
  errorsEl.hidden = false;
}

function action(id, handler) {
  document.getElementById(id).addEventListener("click", async () => {
    const button = document.getElementById(id);
    button.disabled = true;
    try { await handler(); } catch (error) { showError(error.message); }
    finally { button.disabled = false; setButtons(true); }
  });
}
action("openWorkspace", async () => {
  if (!sourceTabId) throw new Error("请先打开财新周刊期刊页。");
  await chrome.tabs.create({ url: chrome.runtime.getURL(`src/popup.html?sourceTab=${sourceTabId}`) });
});

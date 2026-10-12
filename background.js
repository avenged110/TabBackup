// background.js
// Copyright © 2026 avenged110.
// SPDX-License-Identifier: GPL-3.0-only

importScripts("format.js");

const DEFAULT_ICON = { 16: "icons/icon16.png", 32: "icons/icon32.png" };
const ALARM = "scheduled-save";
let resetTimer = null;

function statusIcon(ok) {
  const data = {};
  for (const s of [16, 32]) {
    const g = new OffscreenCanvas(s, s).getContext("2d");
    g.fillStyle = ok ? "#1fa34a" : "#d93025";
    g.beginPath();
    g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#fff";
    g.lineWidth = s * 0.14;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    if (ok) {
      g.moveTo(s * 0.28, s * 0.52);
      g.lineTo(s * 0.44, s * 0.68);
      g.lineTo(s * 0.73, s * 0.35);
    } else {
      g.moveTo(s * 0.33, s * 0.33); g.lineTo(s * 0.67, s * 0.67);
      g.moveTo(s * 0.67, s * 0.33); g.lineTo(s * 0.33, s * 0.67);
    }
    g.stroke();
    data[s] = g.getImageData(0, 0, s, s);
  }
  return data;
}

async function flash(ok) {
  clearTimeout(resetTimer);
  await chrome.action.setIcon({ imageData: statusIcon(ok) });
  resetTimer = setTimeout(() => chrome.action.setIcon({ path: DEFAULT_ICON }), 5000);
}

function stamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} at ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}

// ---------- Export ----------

// Resolves with the final file path once the download completes; rejects if it's interrupted.
function download(filename, text) {
  return new Promise((resolve, reject) => {
    let id = null;
    const pending = [];
    const settle = (item) => {
      if (item.state === "complete") {
        chrome.downloads.onChanged.removeListener(onChanged);
        chrome.downloads.search({ id }).then(([d]) => resolve(d ? d.filename : filename));
      } else if (item.state === "interrupted") {
        chrome.downloads.onChanged.removeListener(onChanged);
        reject(new Error(`Download interrupted (${item.error || "unknown"})`));
      }
    };
    const onChanged = (delta) => {
      if (!delta.state) return;
      const item = { state: delta.state.current, error: delta.error && delta.error.current };
      if (id === null) pending.push([delta.id, item]);
      else if (delta.id === id) settle(item);
    };
    chrome.downloads.onChanged.addListener(onChanged);
    chrome.downloads
      .download({
        url: "data:text/plain;charset=utf-8," + encodeURIComponent(text),
        filename,
        conflictAction: "uniquify",
        saveAs: false,
      })
      .then(async (newId) => {
        id = newId;
        // Catch a state change that fired before we knew our id.
        for (const [pid, item] of pending) if (pid === id) return settle(item);
        const [d] = await chrome.downloads.search({ id });
        if (d) settle(d);
      })
      .catch((e) => {
        chrome.downloads.onChanged.removeListener(onChanged);
        reject(e);
      });
  });
}

// Every normal window's URLs, in tab-strip order, as an array of arrays.
async function currentWindows() {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  return windows
    .map((w) => w.tabs.sort((a, b) => a.index - b.index).map((t) => t.url || t.pendingUrl).filter(Boolean))
    .filter((urls) => urls.length);
}

async function exportUrls() {
  const now = new Date();
  let result;
  try {
    const path = await download(`Tab URLs ${stamp(now)}.txt`, buildText(await currentWindows()));
    result = { ok: true, time: now.toISOString(), path };
  } catch (e) {
    result = { ok: false, time: now.toISOString(), error: String(e.message || e) };
  }
  await chrome.storage.local.set({ lastExport: result });
  await flash(result.ok);
  return result;
}

// ---------- Reopen ----------

async function openWindow(urls) {
  try {
    await chrome.windows.create({ url: urls, focused: false });
    return 0;
  } catch {
    // Some URL was rejected (e.g. a file:// or restricted page); open the rest one by one.
  }
  let win = null;
  let failed = 0;
  for (const url of urls) {
    try {
      if (!win) win = await chrome.windows.create({ url, focused: false });
      else await chrome.tabs.create({ windowId: win.id, url, active: false });
    } catch {
      failed++;
    }
  }
  return failed;
}

async function openAll(windows) {
  let failed = 0;
  for (const urls of windows) failed += await openWindow(urls);
  const total = windows.flat().length;
  await flash(failed === 0);
  return failed < total
    ? { ok: true, opened: total - failed, failed }
    : { ok: false, error: "None of the URLs could be opened." };
}

async function reopenImported() {
  const { imported } = await chrome.storage.local.get("imported");
  return imported ? openAll(imported.windows) : { ok: false, error: "Nothing imported." };
}

// ---------- Backups ----------

const MAX_BACKUPS = 50;

async function saveBackup() {
  const time = new Date().toISOString();
  let result;
  try {
    const windows = await currentWindows();
    if (!windows.length) throw new Error("No tabs to save.");
    const { backups = [] } = await chrome.storage.local.get("backups");
    backups.unshift({ time, windows });
    await chrome.storage.local.set({ backups: backups.slice(0, MAX_BACKUPS) });
    result = { ok: true, time };
  } catch (e) {
    result = { ok: false, time, error: String(e.message || e) };
  }
  await chrome.storage.local.set({ lastSave: result });
  await flash(result.ok);
  return result;
}

async function restoreBackup(time) {
  const { backups = [] } = await chrome.storage.local.get("backups");
  const backup = backups.find((b) => b.time === time);
  return backup ? openAll(backup.windows) : { ok: false, error: "That backup no longer exists." };
}

// ---------- Schedule ----------

// The next run at or after `now`. Days are stepped on the calendar (not as fixed
// 24-hour blocks) so a daily 9:00 AM save stays at 9:00 AM across daylight saving changes.
function nextRun({ when, repeat }, now = Date.now()) {
  if (repeat === "once" || when > now) return when;
  if (repeat === "hourly") return when + Math.ceil((now - when) / 3600000) * 3600000;
  const days = repeat === "weekly" ? 7 : 1;
  const d = new Date(when);
  d.setDate(d.getDate() + Math.max(0, Math.floor((now - when) / (days * 86400000)) - 1) * days);
  while (d.getTime() <= now) d.setDate(d.getDate() + days);
  return d.getTime();
}

// Rebuilds the alarm from the stored schedule. With `catchUp`, a one-time save
// whose time passed while Chromium was closed runs now instead of being dropped.
async function applySchedule({ catchUp = false } = {}) {
  const { schedule } = await chrome.storage.local.get("schedule");
  await chrome.alarms.clear(ALARM);
  if (!schedule) return;
  let when = nextRun(schedule);
  if (when <= Date.now()) {
    if (!catchUp) return chrome.storage.local.remove("schedule");
    when = Date.now() + 1000;
  }
  await chrome.alarms.create(ALARM, { when });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM) return;
  await run("save", saveBackup);
  const { schedule } = await chrome.storage.local.get("schedule");
  if (!schedule) return;
  if (schedule.repeat === "once") await chrome.storage.local.remove("schedule");
  else await applySchedule();
});

// Chromium keeps alarms across restarts and fires missed ones on launch, so only
// rebuild when the alarm has gone missing (e.g. after the extension is updated).
async function ensureSchedule() {
  await chrome.alarms.clear("scheduled-export"); // name used by an earlier version
  if (!(await chrome.alarms.get(ALARM))) await applySchedule({ catchUp: true });
}
chrome.runtime.onStartup.addListener(ensureSchedule);
chrome.runtime.onInstalled.addListener(ensureSchedule);

// ---------- Messages ----------

// One in-flight job per kind: repeat clicks join the running job instead of starting another.
const jobs = {};
function run(kind, fn) {
  return (jobs[kind] ??= fn()
    .catch((e) => ({ ok: false, error: String(e.message || e) }))
    .finally(() => delete jobs[kind]));
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const busyOpening = () => Promise.resolve({ ok: false, error: "Already opening tabs. Try again in a moment." });
  let job;
  if (msg === "export") job = run("export", exportUrls);
  else if (msg === "save") job = run("save", saveBackup);
  else if (msg && msg.restore) job = jobs.open ? busyOpening() : run("open", () => restoreBackup(msg.restore));
  else if (msg === "reopen") job = jobs.open ? busyOpening() : run("open", reopenImported);
  else if (msg === "schedule-changed") {
    job = applySchedule().then(() => chrome.alarms.get(ALARM)).then((a) => (a ? a.scheduledTime : null));
  } else if (msg === "show-popup") {
    // Sent by the import window as it closes; reopen the toolbar popup so "Reopen All Tabs" is one click away.
    setTimeout(() => chrome.action.openPopup().catch(() => {}), 300);
    return;
  } else return;
  job.then(reply);
  return true;
});

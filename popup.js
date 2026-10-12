// popup.js
// Copyright © 2026 avenged110.
// SPDX-License-Identifier: GPL-3.0-only

const $ = (id) => document.getElementById(id);
const ALARM = "scheduled-save";
const fmt = (t) => new Date(t).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const counts = (windows) => `${plural(windows.length, "window")}, ${plural(windows.flat().length, "tab")}`;

function showSave(r) {
  if (!r) return;
  $("lastSave").textContent = `Last saved: ${fmt(r.time)}${r.ok ? "" : " (failed)"}`;
  $("lastSave").title = r.ok ? "" : r.error;
}

// The list always opens on a placeholder, so Restore only enables after an explicit choice.
function showBackups(backups = []) {
  const sel = $("backups");
  const keep = sel.value;
  const placeholder = new Option(backups.length ? "Select a backup…" : "No backups yet", "");
  placeholder.disabled = true;
  sel.replaceChildren(
    placeholder,
    ...backups.map((b) => new Option(`${new Date(b.time).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })} · ${plural(b.windows.flat().length, "tab")}`, b.time))
  );
  sel.value = backups.some((b) => b.time === keep) ? keep : "";
  sel.title = backups.length ? "Newest first. Up to 50 are kept." : "";
  sel.disabled = !backups.length;
  $("restore").disabled = !sel.value;
}

function showExport(r) {
  if (!r) return;
  $("last").textContent = `Last export: ${fmt(r.time)}${r.ok ? "" : " (failed)"}`;
  $("last").title = r.ok ? r.path : r.error;
}

function showImport(imp) {
  $("reopen").disabled = !imp;
  $("unload").hidden = !imp;
  if (!imp) return ($("loaded").textContent = "No file imported");
  $("loaded").textContent = `${counts(imp.windows)} · ${imp.name}`;
  $("loaded").title = imp.name;
}

// What's actually scheduled, as the form would show it; null when nothing is.
let current = null;

function syncScheduleButtons() {
  const same = current && current.repeat === $("repeat").value && current.when === $("when").value;
  $("schedule").disabled = !!same;
  $("unschedule").disabled = !current;
}

function setCurrent(time, repeat) {
  current = time ? { when: toLocalInput(time), repeat } : null;
  if (current) {
    $("when").value = current.when;
    $("repeat").value = repeat;
  }
  showNext(time, repeat);
  syncScheduleButtons();
}

function showNext(time, repeat) {
  if (!time) return ($("next").textContent = "Not scheduled");
  const every = { hourly: " · hourly", daily: " · daily", weekly: " · weekly" }[repeat] || "";
  $("next").textContent = `Next save: ${new Date(time).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${every}`;
}

const opened = (r) =>
  r.ok ? `Opened ${plural(r.opened, "tab")}${r.failed ? `, ${r.failed} couldn't be opened` : ""}` : r.error;

// datetime-local wants "YYYY-MM-DDTHH:MM" in local time.
function toLocalInput(ms) {
  return new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

async function busy(btn, fn) {
  btn.disabled = true;
  try {
    await fn();
  } catch (e) {
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}

(async () => {
  const s = await chrome.storage.local.get(["lastSave", "backups", "lastExport", "imported", "schedule"]);
  showSave(s.lastSave);
  showBackups(s.backups);
  showExport(s.lastExport);
  showImport(s.imported);
  const alarm = await chrome.alarms.get(ALARM);
  $("when").value = toLocalInput(Date.now() + 3600000);
  setCurrent(alarm && s.schedule && alarm.scheduledTime, s.schedule && s.schedule.repeat);
})();

// Keep the popup in sync if a scheduled save lands while it's open.
chrome.storage.onChanged.addListener(async (c) => {
  if (c.backups) showBackups(c.backups.newValue);
  if (c.lastSave) showSave(c.lastSave.newValue);
  if (c.imported) showImport(c.imported.newValue);
  // A scheduled save just ran (the alarm has moved on) or a one-time schedule finished.
  if (c.lastSave || (c.schedule && !c.schedule.newValue)) {
    const [{ schedule }, alarm] = await Promise.all([chrome.storage.local.get("schedule"), chrome.alarms.get(ALARM)]);
    setCurrent(schedule && alarm && alarm.scheduledTime, schedule && schedule.repeat);
  }
});

$("backups").addEventListener("change", () => ($("restore").disabled = !$("backups").value));
$("repeat").addEventListener("change", syncScheduleButtons);
$("when").addEventListener("input", syncScheduleButtons);

$("save").addEventListener("click", () =>
  busy($("save"), async () => showSave(await chrome.runtime.sendMessage("save")))
);

$("restore").addEventListener("click", () =>
  busy($("restore"), async () => {
    $("restoreMsg").textContent = opened(await chrome.runtime.sendMessage({ restore: $("backups").value }));
  }).then(() => ($("restore").disabled = !$("backups").value))
);

$("schedule").addEventListener("click", async () => {
  const when = new Date($("when").value).getTime();
  const repeat = $("repeat").value;
  if (!when) return ($("next").textContent = "Pick a date and time first");
  if (repeat === "once" && when <= Date.now()) return ($("next").textContent = "That time has already passed");
  await chrome.storage.local.set({ schedule: { when, repeat } });
  setCurrent(await chrome.runtime.sendMessage("schedule-changed"), repeat);
});

$("unschedule").addEventListener("click", async () => {
  await chrome.storage.local.remove("schedule");
  setCurrent(await chrome.runtime.sendMessage("schedule-changed"));
});

$("unload").addEventListener("click", async () => {
  await chrome.storage.local.remove("imported");
  showImport(null);
});

$("export").addEventListener("click", () =>
  busy($("export"), async () => showExport(await chrome.runtime.sendMessage("export")))
);

// On macOS the toolbar popup closes as soon as a file dialog opens, so the picker lives in its own small window.
$("import").addEventListener("click", async () => {
  const [existing] = await chrome.tabs.query({ url: chrome.runtime.getURL("import.html") });
  if (existing) await chrome.windows.update(existing.windowId, { focused: true });
  else await chrome.windows.create({ url: "import.html", type: "popup", width: 360, height: 200 });
  window.close();
});

$("reopen").addEventListener("click", () =>
  busy($("reopen"), async () => ($("loaded").textContent = opened(await chrome.runtime.sendMessage("reopen"))))
);

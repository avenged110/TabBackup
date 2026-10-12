// import.js
// Copyright © 2026 avenged110.
// SPDX-License-Identifier: GPL-3.0-only

const input = document.getElementById("file");
const msg = document.getElementById("msg");

function say(text, cls = "") {
  msg.textContent = text;
  msg.className = cls;
}

document.getElementById("choose").addEventListener("click", () => input.click());

input.addEventListener("change", async () => {
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  try {
    if (!file.name.toLowerCase().endsWith(".txt")) throw new Error("Please choose a .txt file.");
    if (file.size > 5 * 1024 * 1024) throw new Error("That file is too large to be an export.");
    const windows = parseText(await file.text());
    await chrome.storage.local.set({ imported: { name: file.name, windows } });
    const tabs = windows.flat().length;
    say(`Loaded ${windows.length} window${windows.length === 1 ? "" : "s"}, ${tabs} tab${tabs === 1 ? "" : "s"}`, "ok");
    setTimeout(() => {
      chrome.runtime.sendMessage("show-popup");
      window.close();
    }, 1200);
  } catch (e) {
    say(e.message, "err");
  }
});

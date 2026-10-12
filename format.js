// format.js
// Copyright © 2026 avenged110.
// SPDX-License-Identifier: GPL-3.0-only

// File format shared by the exporter (background.js) and the importer (import.js).
const SIGNATURE = "TUE1-5f3c9a7e2b81d046";
const RULE = "–".repeat(40);

function buildText(windows) {
  return SIGNATURE + "\n\n" + windows
    .map((w, i) => `Window ${i + 1}\n${RULE}\n` + w.join("\n\n"))
    .join("\n\n\n") + "\n";
}

// Returns an array of windows, each an array of URLs. Throws if the file isn't an export.
function parseText(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0].trim() !== SIGNATURE) throw new Error("This isn't a TabBackup file.");
  const windows = [];
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (!line || /^[–-]+$/.test(line)) continue;
    if (/^Window \d+$/.test(line)) windows.push([]);
    else if (windows.length) windows[windows.length - 1].push(line);
  }
  const nonEmpty = windows.filter((w) => w.length);
  if (!nonEmpty.length) throw new Error("The file doesn't contain any URLs.");
  return nonEmpty;
}

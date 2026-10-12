# TabBackup

A crude Chromium extension for saving and restoring all existing tabs.

- Save all existing tabs to the extension's on-disk local storage.
- Optionally schedule this save to occur automatically at a specific time and date once, hourly, daily, or weekly.
- Restore from these backups to re-open all saved tabs and windows. This restoration occurs in addition to anything that might already be open. Because every tab opens at once, large backups will incur a temporary, but significant performance degradation during restoration.
- Optionally export the tabs as a list of URLs in a plain text document. Restoration can then be performed from one of these text documents.
- Enable "Allow in Incognito" if you want it to include URLs from Incognito mode windows.

If Chromium decides not to correctly restore tabs after being quit in any manner other than exactly how it wanted, this holds a persistent copy of every URL for restoration. Would've saved me a lot of irritation had I bothered with this years ago.

## Installation

Unzip the extension and place the folder somewhere permanent. Navigate to chrome://extensions, enable the "Developer Mode" toggle, click the "Load Unpacked" button, and select the TabBackup folder in the filesystem dialog.

## Support

If you find a bug, please report it here on GitHub and I will try to fix it. Please be as thorough in your reporting as you can.

You're welcome to request features or changes if you're so-inclined, and I will give such requests due consideration, but just know that this application was built first and foremost for an audience of one and I consider it feature-complete at this time.

TabBackup is available in English only, by design.

## Note

I am not a software engineer; all of the code for this project was written by Anthropic's Claude models. That said, I use all of the applications under this account regularly in my daily life, so while they're not perfect, I'm confident in their efficacy and general reliability.

## License

TabBackup is free software, licensed under the GNU General Public License, version 3 only (GPL-3.0-only). Copyright © 2026 avenged110. The full license text is in `COPYING`.


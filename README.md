# To-Remind (Chrome Extension)

Minimal Chrome extension for quick “to-remind” nudges. Add a title + future date/time,
then mark Done or Delete. Custom date picker limits you to today → +2 years and prevents
saving past times.

## Features
- Custom date picker (Year/Month/Day) limited to **today → +2 years**
- Future-only: past selections auto-bump to the **next minute**
- **Done** &  **Delete** with a quick color flash (green/red)
- Persists using `chrome.storage.local`
- Simple, dark UI; no external frameworks

## Install (Load Unpacked)
1. Clone/download this repo.
2. Go to `chrome://extensions/` → enable **Developer mode**.
3. Click **Load unpacked** → select the project folder.

## Usage
1. Enter a **Title**, pick **Year/Month/Day** and **Time**.
2. Click **Add reminder**.
3. Use **Done** or **Delete** on items. (Done flashes green; Delete flashes red.)

## Project Structure

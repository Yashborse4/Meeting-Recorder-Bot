# 🤖 Google Meet Recorder Bot & Web Dashboard

<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Meeting Recorder Bot Logo" />
</p>

<p align="center">
  <strong>An autonomous, privacy-first Google Meet recording bot paired with an OLED dark-themed web dashboard for scheduling classes, persistent Google account login, smart auto-leave rules, and local video storage.</strong>
</p>

<p align="center">
  <a href="#key-features"><img src="https://img.shields.io/badge/Manifest-V3-blue.svg" alt="Manifest V3" /></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/Dashboard-http%3A%2F%2Flocalhost%3A3000-00f2fe.svg" alt="Web Dashboard" /></a>
  <a href="#architecture"><img src="https://img.shields.io/badge/Node.js-v20%2B-green.svg" alt="Node.js" /></a>
  <a href="#architecture"><img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" /></a>
  <a href="#architecture"><img src="https://img.shields.io/badge/Puppeteer-Automated-purple" alt="Puppeteer" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-ISC-brightgreen.svg" alt="License" /></a>
</p>

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Quick Start](#-quick-start)
  - [1. Prerequisites](#1-prerequisites)
  - [2. Installation & Build](#2-installation--build)
  - [3. Launch the Web Dashboard](#3-launch-the-web-dashboard)
- [Web Dashboard Guide](#-web-dashboard-guide)
  - [Weekly Timetable (Mon–Sun)](#1-weekly-timetable-mon-to-sun)
  - [Google Account Management](#2-google-account-management)
  - [Smart Auto-Leave Rules](#3-smart-auto-leave-rules)
  - [Custom Video Storage](#4-custom-video-storage-directory)
  - [Recordings Library](#5-recordings-library)
- [Hands-Free Bot Engine](#-hands-free-bot-engine)
  - [Allowlist Flags](#1-allowlist-flags--deterministic-id)
  - [Zero-Click DOM Trigger](#2-zero-click-dom-trigger)
  - [Running via CLI](#3-running-via-cli)
- [REST API Reference](#-rest-api-reference)
- [Project Structure](#-project-structure)
- [Troubleshooting & FAQ](#-troubleshooting--faq)
- [License](#-license)

---

## 🌟 Overview

The **Meeting Recorder Bot** eliminates the friction of recording lectures, team standups, and corporate calls. It combines:

1. **A Chrome MV3 Extension:** Captures high-definition tab video, mixes two-way audio (microphone + attendees) with continuous speaker passthrough, scrubs live captions into timestamped transcripts (`.txt` & `.vtt`), and logs attendee attendance (`.csv`).
2. **An Autonomous Node.js Bot:** Controls Chromium hands-free using Puppeteer, automates Meet lobby entry (muting mic & camera), and signals the extension without requiring physical mouse clicks.
3. **An OLED Dark Web Dashboard:** A responsive, dark-mode control center (`http://localhost:3000`) for scheduling weekly classes (Mon–Sun), managing Google login accounts, customizing auto-leave conditions, and organizing recorded media.

---

## ✨ Key Features

### 📅 Weekly Class Timetable (Monday – Sunday)
- Add recurring classes with custom meeting links, start times (`HH:MM`), and durations.
- Select any active days (**Mon, Tue, Wed, Thu, Fri, Sat, Sun**) or use quick presets (*Weekdays* / *Full Week*).
- Live countdown ticker showing your next upcoming scheduled lecture.
- One-click **"Record Now"** button on any class card to launch immediately.

### 👤 Persistent Google Account Login
- **Connected Status Pill:** Displays your connected Google profile picture, display name, and email address.
- **1-Click Desktop Chrome Import:** Instant copy of your existing desktop Chrome login cookies and credentials into the bot profile.
- **Chrome Login Window:** Launch a dedicated browser window to log in to institutional or restricted Google Workspace accounts.
- **Guest Mode Fallback:** Automatically provides custom bot display name in guest lobbies if no account is connected.

### 🚪 Smart Auto-Leave Rules
- **Participant Drop Threshold:** Automatically leaves the call and stops recording when attendee count drops below your chosen threshold (e.g. `<= 2`).
- **Grace Period Protection:** Configurable countdown timer (e.g. 60s) prevents premature exit if a participant temporarily disconnects.
- **Host Exit Detection:** Exits immediately when the meeting is ended for everyone or if the bot is removed from the call.
- **Max Scheduled Duration Limit:** Hard cap that ends recording when scheduled class duration expires.

### 📂 Configurable File Storage
- Direct all recordings (`.webm`), transcripts (`.txt`), subtitles (`.vtt`), and attendance lists (`.csv`) to any folder on your computer (e.g. `D:\Lectures\Recordings`).
- Chromium download behavior dynamically updates via Chrome DevTools Protocol (CDP).

### 🎥 Studio-Quality Capture & Zero Memory Leaks
- **Two-Way Audio Mixing:** Web Audio API mixes your microphone input with remote participants into a single synchronized audio track.
- **Continuous Speaker Passthrough:** Prevents the tab from going silent when Chrome tabCapture engages.
- **IndexedDB 5s Chunk Streaming:** Media is chunked every 5 seconds to local storage, preventing out-of-memory crashes on multi-hour calls.
- **EBML Duration Patching:** WebM files are patched with accurate headers for instantaneous scrubbing in VLC, QuickTime, and Premiere.

---

## 🏗 Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Web Dashboard Frontend                          │
│   http://localhost:3000 (OLED Dark UI, HTML5 / Modern Vanilla CSS / JS)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP REST API
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Node.js / Express Backend Server                      │
│   ├── Timetable Scheduler Daemon (Runs every 15s)                      │
│   ├── Settings Manager (Storage Path, Auto-Leave Config)               │
│   ├── Account Manager (bot_profile & System Chrome Preferences)        │
│   └── MeetRecorderBot (Puppeteer Chromium Controller)                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Puppeteer / Chrome DevTools Protocol
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│              Chromium Browser (Loaded with Extension)                  │
│   ├── Google Meet Tab                                                  │
│   │   └── Content Script (scrapingScript.ts) [Captions & Transcripts]  │
│   ├── Background Service Worker (background.ts) [Stream Coordination]  │
│   └── Offscreen Document (offscreen.ts) [MediaRecorder + AudioContext] │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher ([Download Node.js](https://nodejs.org/))
- **Google Chrome** or **Chromium**

### 2. Installation & Build

Clone the repository and install dependencies:

```bash
git clone https://github.com/Yashborse4/Meeting-Recorder-Bot.git
cd Meeting-Recorder-Bot

# Install extension dependencies & compile TypeScript
npm install
npm run build

# Install backend dependencies
cd backend
npm install
cd ..
```

### 3. Launch the Web Dashboard

Start the integrated web dashboard and scheduler daemon:

```bash
npm run dashboard
```

Open your browser and navigate to:
👉 **`http://localhost:3000`**

---

## 🖥 Web Dashboard Guide

### 1. Weekly Timetable (Mon to Sun)
* Click **"Add New Class"** to open the modal.
* Enter the **Class Name**, **Google Meet URL** (`https://meet.google.com/xxx-yyyy-zzz`), select the active **Days of the Week**, set the **Time** (`HH:MM`), and set the **Duration** in minutes.
* Use the day filter pills at the top to filter classes for any specific day.
* Toggle the switch on any card to pause or resume automated recording for that class.

### 2. Google Account Management
* Navigate to **Settings & Account**.
* The **Google Account Connection** card shows whether you are running in **Guest Mode** or with an **Authenticated Account**.
* Click **"Quick Import from Chrome"** to instantly import your login credentials from your local Chrome profile.
* Alternatively, click **"Log In via Chrome"** to open an interactive Chrome window to log into your Google Account. Sessions persist permanently in `backend/bot_profile/`.
* Click **"Log Out"** at any time to return to Guest Mode.

### 3. Smart Auto-Leave Rules
* In **Settings & Account** ➔ **Smart Auto-Leave Rules**:
  * **Leave when participants drop below**: Set the minimum participant threshold (default: `2`).
  * **Grace period before leaving**: Seconds to wait before exiting (default: `60s`).
  * **Exit immediately when host ends meeting**: Automatically stops recording when the meeting screen displays ended/removed.
  * **Enforce scheduled class duration limit**: Automatically stops recording once the scheduled minutes expire.

### 4. Custom Video Storage Directory
* In **Settings & Account** ➔ **Video & File Storage Location**:
  * Enter any absolute path (e.g. `E:\Recordings` or `C:\Users\username\Videos\Classes`).
  * Click **"Apply Path"**. The folder is created automatically if it does not exist, and all future downloads are saved there.

### 5. Recordings Library
* Switch to the **Recordings Library** tab to inspect all saved `.webm` video recordings, `.txt` formatted transcripts, `.vtt` subtitles, and `.csv` attendance rosters.
* Download files directly to your device or delete old recordings.

---

## ⚡ Hands-Free Bot Engine

### 1. Allowlist Flags & Deterministic ID
The extension manifest includes a deterministic RSA public key giving it a permanent extension ID:
```text
mplkadfplilndegehopgdojhlpddgdfl
```

When Chromium launches, it receives the following command-line flags:
```text
--allowlisted-extension-id=mplkadfplilndegehopgdojhlpddgdfl
--whitelisted-extension-id=mplkadfplilndegehopgdojhlpddgdfl
--enable-features=MediaRouter
--use-fake-ui-for-media-stream
--autoplay-policy=no-user-gesture-required
```
These tell Chromium's media router to grant `tabCapture` stream permissions without throwing interactive user permission prompts.

### 2. Zero-Click DOM Trigger
The bot starts and stops recording hands-free via in-page DOM events dispatched directly into the Google Meet window:
```javascript
// Start recording
window.postMessage({ type: 'START_RECORDING_BOT' }, '*');

// Stop recording & finalize files
window.postMessage({ type: 'STOP_RECORDING_BOT' }, '*');
```

### 3. Running via CLI

You can also run ad-hoc recordings directly from your terminal:

```bash
# Record a meeting for 45 minutes
node backend/src/index.js https://meet.google.com/abc-defg-hij 45
```

Or run the timetable scheduler daemon in headless CLI mode:
```bash
node backend/src/scheduler.js
```

---

## 📡 REST API Reference

The backend Express server exposes a full REST API for automation and integrations:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/status` | Returns scheduler state, upcoming class, current time, and connected account |
| `POST` | `/api/scheduler/toggle` | Toggles the timetable background scheduler daemon (Pause / Resume) |
| `GET` | `/api/account` | Returns connected Google account profile (name, email, avatar) |
| `POST` | `/api/account/login` | Launches Chrome window to sign in to Google |
| `POST` | `/api/account/import` | 1-click import of session cookies from desktop Chrome |
| `POST` | `/api/account/logout` | Disconnects account and wipes bot session credentials |
| `GET` | `/api/settings` | Returns active settings (storage directory, auto-leave rules, bot preferences) |
| `POST` | `/api/settings` | Updates storage path or auto-leave rules |
| `GET` | `/api/timetable` | Returns list of all scheduled classes |
| `POST` | `/api/timetable` | Adds a new class or updates an existing class |
| `PATCH` | `/api/timetable/:id/toggle`| Enables or disables an individual class |
| `DELETE`| `/api/timetable/:id` | Deletes a class from the timetable |
| `POST` | `/api/record/start` | Manually triggers instant recording for a given Google Meet URL |
| `POST` | `/api/record/stop` | Stops the active recording and finalizes files |
| `GET` | `/api/recordings` | Lists all files saved in the configured storage directory |
| `DELETE`| `/api/recordings/:filename`| Deletes a specific recording or transcript file |

---

## 📂 Project Structure

```text
Meeting-Recorder-Bot/
├── backend/                         # Node.js backend (MVC Architecture)
│   ├── public/                      # [VIEW] Web dashboard frontend
│   │   ├── index.html               # Monochrome black & white dashboard HTML5
│   │   ├── style.css                # Obsidian high-contrast monochrome CSS
│   │   └── app.js                   # Reactive UI controller & API client
│   ├── src/
│   │   ├── config/                  # Central configuration & Chrome launch flags
│   │   ├── models/                  # [MODEL] Timetable, settings, account, & recording data
│   │   │   ├── timetableModel.js
│   │   │   ├── settingsModel.js
│   │   │   ├── accountModel.js
│   │   │   └── recordingModel.js
│   │   ├── controllers/             # [CONTROLLER] Request validation & responses
│   │   │   ├── statusController.js
│   │   │   ├── timetableController.js
│   │   │   ├── recordingController.js
│   │   │   ├── settingsController.js
│   │   │   ├── accountController.js
│   │   │   └── browserController.js
│   │   ├── routes/                  # Express REST API routes mounted under /api
│   │   │   ├── index.js
│   │   │   └── ... (modular route definitions)
│   │   ├── services/                # Core engines, Meet automation & scheduler daemon
│   │   │   ├── meetBot.js
│   │   │   ├── browserService.js
│   │   │   ├── schedulerService.js
│   │   │   └── storageService.js
│   │   ├── utils/                   # Helpers: timeUtils (IST 12h/24h) & browserLauncher
│   │   ├── app.js                   # Express application setup & middleware
│   │   ├── server.js                # Server entry point (starts daemon on port 3000)
│   │   ├── index.js                 # Standalone CLI meeting runner
│   │   └── manageTimetable.js       # Standalone CLI timetable manager
│   ├── package.json                 # Backend dependencies (Express, Puppeteer)
│   ├── settings.example.json        # Default settings template
│   └── timetable.example.json       # Sample timetable template
├── src/                             # Chrome MV3 Extension Source (TypeScript)
│   ├── background.ts                # Service worker (tab capture coordination)
│   ├── offscreen.ts                 # Offscreen audio mixer & MediaRecorder
│   ├── popup.ts                     # Extension popup UI logic
│   ├── scrapingScript.ts            # Content script (captions & DOM triggers)
│   └── micsetup.ts                  # Audio permissions handler
├── icons/                           # Extension and dashboard icons
├── manifest.json                    # Manifest V3 configuration & static RSA key
├── package.json                     # Root build scripts & bundler dependencies
├── tsconfig.json                    # TypeScript compiler configuration
├── webpack.config.js                # Webpack 5 production bundler configuration
└── README.md                        # Complete project documentation
```

---

## ❓ Troubleshooting & FAQ

#### Q: How do I ensure live captions are captured?
> **A:** Transcripts are generated by observing Google Meet's live captions. The bot automatically simulates pressing <kbd>C</kbd> upon joining to enable captions. If joining manually, click the **CC** button on the Meet toolbar.

#### Q: Where are my recordings saved?
> **A:** Recordings are saved to the path configured in **Settings & Account** ➔ **Video & File Storage Location** (default: `backend/recordings/`). You can change this to any folder on your machine at any time.

#### Q: Does the bot work with restricted institutional / university accounts?
> **A:** Yes. Under the **Settings & Account** tab, click **"Log In via Chrome"** or **"Quick Import from Chrome"** to authenticate with your university or corporate Google Workspace account. The bot will use these authenticated credentials instead of joining as a guest.

#### Q: Can I run the dashboard continuously in the background?
> **A:** Yes. Running `npm run dashboard` starts both the Express dashboard and the background scheduler daemon. You can keep it running in your terminal or use a process manager like `pm2`:
> ```bash
> pm2 start backend/src/server.js --name "meet-recorder"
> ```

---

## 📄 License

This project is open-source and licensed under the [ISC License](LICENSE).

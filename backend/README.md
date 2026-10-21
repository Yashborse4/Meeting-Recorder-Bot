# Google Meet Recording Bot - Backend Controller

This directory contains the standalone Node.js backend controller that automates Google Meet sessions and triggers the Chrome extension recording hands-free.

---

## Directory Layout

```
backend/
├── package.json          # Backend dependencies (puppeteer)
├── README.md             # This guide
├── recordings/           # Output directory for video (.webm) and transcripts (.txt, .vtt)
└── src/
    ├── config.js         # Allowlisted flags, extension ID, and file paths
    ├── browser.js        # Chromium launch and CDP download controller
    ├── meetBot.js        # Google Meet lobby automation, captions & hands-free trigger
    ├── storage.js        # Post-recording file watcher and metadata generation
    └── index.js          # CLI entry point and class export
```

---

## Setup & Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Run the Bot
```bash
npm start -- https://meet.google.com/your-meeting-code 15 "My Recording Bot"
```
* **Argument 1:** Google Meet URL.
* **Argument 2:** Recording duration in minutes (e.g. `15`).
* **Argument 3:** (Optional) Bot display name.

---

## Programmatic Usage

You can embed the `MeetRecorderBot` directly into your existing Express or background worker services:

```javascript
const { MeetRecorderBot } = require('./backend/src');

async function recordMeeting() {
  const bot = new MeetRecorderBot({
    botName: 'AI Transcriber',
    muteMicOnJoin: true,
    turnOffCameraOnJoin: true,
  });

  await bot.launch();
  await bot.joinMeeting('https://meet.google.com/xyz-abcd-efg');
  await bot.startRecording();

  // Record for 10 minutes
  await new Promise((r) => setTimeout(r, 10 * 60 * 1000));

  const results = await bot.stopRecording();
  console.log('Recorded video files:', results.videos);
  console.log('Recorded transcripts:', results.transcripts);

  await bot.close();
}
```

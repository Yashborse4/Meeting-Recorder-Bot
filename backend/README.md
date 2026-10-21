# Google Meet Recording Bot - Backend Controller

This directory contains the standalone Node.js backend controller designed with a clean **MVC (Model-View-Controller)** architecture. It powers the Web Dashboard, automates Google Meet lobby admission, monitors weekly timetables in Indian Standard Time (IST), manages 3-attempt rejoin loops, and triggers recording hands-free.

---

## 🏛️ MVC Architecture & Directory Layout

```
backend/
├── package.json              # Backend dependencies (Express, Puppeteer)
├── README.md                 # This documentation
├── timetable.json            # Active scheduled weekly classes & meetings
├── settings.json             # Bot configurations & persistent preferences
├── recordings/               # Output directory for video (.webm) and transcripts (.txt, .vtt)
├── bot_profile/              # Chromium profile preserving authenticated Google session
├── public/                   # [VIEW] Monochrome Responsive Web Dashboard (HTML/CSS/JS)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── src/
    ├── config/               # Configuration & flags
    │   └── index.js          # Central paths, Chrome flags, extension IDs
    ├── models/               # [MODEL] Data access & persistence layer
    │   ├── timetableModel.js # Timetable queries, CRUD, multi-slot builder, next upcoming
    │   ├── settingsModel.js  # App settings, defaults, storage path, auto-leave rules
    │   ├── accountModel.js   # Google account detection, Chrome profile import, login
    │   └── recordingModel.js # Media file scanning, metadata, file deletion
    ├── views/ -> public/     # Static presentation layer served by Express
    ├── controllers/          # [CONTROLLER] Request handling & response serialization
    │   ├── statusController.js    # Bot status & daemon toggle
    │   ├── timetableController.js # Timetable CRUD endpoints
    │   ├── recordingController.js # Manual start/stop and file management
    │   ├── settingsController.js  # App preferences get/update
    │   ├── accountController.js   # Google auth, 1-click import, logout
    │   └── browserController.js   # System browser launcher
    ├── routes/               # Dedicated routing definitions
    │   ├── index.js          # Main API router mounting all modules on /api
    │   ├── statusRoutes.js
    │   ├── timetableRoutes.js
    │   ├── recordingRoutes.js
    │   ├── settingsRoutes.js
    │   ├── accountRoutes.js
    │   └── browserRoutes.js
    ├── services/             # Core automation engines & background daemons
    │   ├── meetBot.js        # Google Meet lobby, host admission waiter, auto-leave
    │   ├── browserService.js # Puppeteer launcher, persistent profile, CDP downloads
    │   ├── schedulerService.js # 15s timetable daemon, 3-attempt rejoin loop
    │   └── storageService.js # Post-recording file download watcher & metadata
    ├── utils/                # Helper utilities
    │   ├── timeUtils.js      # 12h/24h conversion, IST (Asia/Kolkata) date helpers
    │   └── browserLauncher.js # Cross-platform default browser opener
    ├── app.js                # Express application setup, middlewares, static views
    ├── server.js             # HTTP listener & daemon startup
    ├── index.js              # Standalone CLI meeting runner
    └── manageTimetable.js    # Standalone CLI timetable manager
```

---

## 🚀 Setup & Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Launch the Web Dashboard
```bash
npm run dashboard
```
Opens the Web Dashboard automatically at `http://localhost:3000`.

### 3. Run a One-Off Meeting via CLI
```bash
npm start -- https://meet.google.com/your-meeting-code 15 "My Recording Bot"
```
* **Argument 1:** Google Meet URL.
* **Argument 2:** Recording duration in minutes (e.g. `15`).
* **Argument 3:** (Optional) Bot display name.

### 4. Manage Timetable via CLI
```bash
# List all scheduled classes
npm run schedule:list

# Add a multi-day class
node src/manageTimetable.js add "Operating Systems" "https://meet.google.com/xyz" "mon,wed,fri" "10:30" 60
```

---

## 💻 Programmatic Usage

You can import `MeetRecorderBot` or the modular services directly into your own Node.js applications:

```javascript
const { MeetRecorderBot } = require('./backend/src/services/meetBot');

async function recordMeeting() {
  const bot = new MeetRecorderBot({
    botName: 'AI Transcriber',
    muteMicOnJoin: true,
    turnOffCameraOnJoin: true,
    maxLobbyWaitMin: 15,
  });

  await bot.launch();
  await bot.joinMeeting('https://meet.google.com/xyz-abcd-efg');
  await bot.startRecording(45); // Records for 45 minutes

  const results = await bot.stopRecording();
  console.log('Saved videos:', results.videos);
  console.log('Saved transcripts:', results.transcripts);

  await bot.close();
}
```

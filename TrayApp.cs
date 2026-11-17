using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.NetworkInformation;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace GoogleMeetRecorder {
    static class Program {
        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        static void Main() {
            try {
                try { SetProcessDPIAware(); } catch { }

                bool isNewInstance;
                using (Mutex mutex = new Mutex(true, "GoogleMeetRecorder_TrayApp_Singleton", out isNewInstance)) {
                    if (!isNewInstance) {
                        TrayAppContext.OpenDashboardUI();
                        return;
                    }

                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);
                    Application.Run(new TrayAppContext());
                }
            } catch (Exception ex) {
                try {
                    string logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "tray_crash.log");
                    File.WriteAllText(logPath, ex.ToString());
                } catch { }
            }
        }
    }

    public class TrayAppContext : ApplicationContext {
        private NotifyIcon notifyIcon;
        private Process serverProcess;
        private string projectDir;
        private string recordingsDir;
        private ToolStripMenuItem statusMenuItem;
        private System.Windows.Forms.Timer healthCheckTimer;
        private Form hiddenHostForm;

        public TrayAppContext() {
            // Keep message loop alive indefinitely in the system tray
            hiddenHostForm = new Form {
                ShowInTaskbar = false,
                WindowState = FormWindowState.Minimized,
                FormBorderStyle = FormBorderStyle.None,
                Size = new Size(0, 0),
                Opacity = 0
            };
            this.MainForm = hiddenHostForm;

            ResolvePaths();
            InitializeTrayIcon();
            StartServer();

            // Check if launched with --startup or --silent
            string[] args = Environment.GetCommandLineArgs();
            bool isSilent = false;
            for (int i = 1; i < args.Length; i++) {
                if (args[i].Equals("--startup", StringComparison.OrdinalIgnoreCase) ||
                    args[i].Equals("--silent", StringComparison.OrdinalIgnoreCase)) {
                    isSilent = true;
                    break;
                }
            }

            if (!isSilent) {
                // Launch the desktop UI window as soon as the background server is ready
                Thread readyThread = new Thread(() => {
                    for (int i = 0; i < 30; i++) {
                        if (IsPortListening(3000)) break;
                        Thread.Sleep(100);
                    }
                    OpenDashboardUI();
                });
                readyThread.IsBackground = true;
                readyThread.Start();
            }

            // Background health check timer (every 10 seconds)
            healthCheckTimer = new System.Windows.Forms.Timer();
            healthCheckTimer.Interval = 10000;
            healthCheckTimer.Tick += (s, e) => UpdateStatus();
            healthCheckTimer.Start();

            Application.ApplicationExit += OnApplicationExit;
        }

        private void ResolvePaths() {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            if (Directory.Exists(Path.Combine(baseDir, "Record Bot"))) {
                projectDir = Path.Combine(baseDir, "Record Bot");
            } else {
                projectDir = baseDir;
            }
            recordingsDir = Path.Combine(projectDir, "backend", "recordings");
        }

        private void InitializeTrayIcon() {
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.RenderMode = ToolStripRenderMode.System;

            ToolStripMenuItem openItem = new ToolStripMenuItem("🚀 Open Web Dashboard");
            openItem.Font = new Font(menu.Font, FontStyle.Bold);
            openItem.Click += (s, e) => OpenDashboardUI();
            menu.Items.Add(openItem);

            ToolStripMenuItem folderItem = new ToolStripMenuItem("📁 Open Recordings Folder");
            folderItem.Click += (s, e) => OpenRecordingsFolder();
            menu.Items.Add(folderItem);

            menu.Items.Add(new ToolStripSeparator());

            statusMenuItem = new ToolStripMenuItem("🟢 Status: Starting...");
            statusMenuItem.Enabled = false;
            menu.Items.Add(statusMenuItem);

            ToolStripMenuItem restartItem = new ToolStripMenuItem("🔄 Restart Bot Server");
            restartItem.Click += (s, e) => RestartServer();
            menu.Items.Add(restartItem);

            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem exitItem = new ToolStripMenuItem("❌ Exit & Stop Recorder");
            exitItem.Click += (s, e) => ExitApplication();
            menu.Items.Add(exitItem);

            // Load crisp high-DPI tray icon tailored for Windows 11 taskbars
            Icon trayIcon = LoadTrayIcon();

            notifyIcon = new NotifyIcon {
                Icon = trayIcon,
                ContextMenuStrip = menu,
                Text = "Google Meet Recorder (Active)",
                Visible = true
            };

            notifyIcon.DoubleClick += (s, e) => OpenDashboardUI();
            notifyIcon.BalloonTipClicked += (s, e) => OpenDashboardUI();

            notifyIcon.ShowBalloonTip(
                3000,
                "Google Meet Recorder Active",
                "Running in the background. Double-click tray icon to open dashboard anytime.",
                ToolTipIcon.Info
            );
        }

        private Icon LoadTrayIcon() {
            Size smallSize = SystemInformation.SmallIconSize;
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string trayIcoPath = Path.Combine(baseDir, "tray.ico");
            string appIcoPath = Path.Combine(baseDir, "app.ico");

            // 1. Try embedded manifest resource (tray.ico)
            try {
                using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("tray.ico")) {
                    if (stream != null) return new Icon(stream, smallSize);
                }
            } catch { }

            // 2. Try file system tray.ico
            if (File.Exists(trayIcoPath)) {
                try { return new Icon(trayIcoPath, smallSize); } catch { }
            }

            // 3. Fallback to app.ico
            if (File.Exists(appIcoPath)) {
                try { return new Icon(appIcoPath, smallSize); } catch { }
            }

            return SystemIcons.Application;
        }

        private void StartServer() {
            if (IsPortListening(3000)) {
                statusMenuItem.Text = "🟢 Status: Active (Port 3000)";
                return;
            }

            try {
                ProcessStartInfo psi = new ProcessStartInfo {
                    FileName = "cmd.exe",
                    Arguments = "/c node backend\\src\\server.js --managed",
                    WorkingDirectory = projectDir,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = false
                };

                serverProcess = Process.Start(psi);
                statusMenuItem.Text = "🟢 Status: Active (Port 3000)";
            } catch (Exception ex) {
                statusMenuItem.Text = "🔴 Status: Error starting";
                MessageBox.Show(
                    "Could not start Google Meet Recorder server:\n" + ex.Message,
                    "Startup Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private void StopServer() {
            try {
                if (serverProcess != null && !serverProcess.HasExited) {
                    serverProcess.Kill();
                }
            } catch { }

            KillProcessesOnPort(3000);

            try {
                ProcessStartInfo psi = new ProcessStartInfo {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -Command \"Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'bot_profile' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }\"",
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = false
                };
                Process p = Process.Start(psi);
                if (p != null) p.WaitForExit(3000);
            } catch { }
        }

        private void RestartServer() {
            statusMenuItem.Text = "🟡 Status: Restarting...";
            StopServer();
            Thread.Sleep(1200);
            StartServer();
            notifyIcon.ShowBalloonTip(2000, "Google Meet Recorder", "Bot server restarted successfully.", ToolTipIcon.Info);
        }

        private void UpdateStatus() {
            if (IsPortListening(3000)) {
                statusMenuItem.Text = "🟢 Status: Active (Port 3000)";
            } else {
                statusMenuItem.Text = "🟡 Status: Offline - Click Restart";
            }
        }

        public static void OpenDashboardUI() {
            string url = "http://localhost:3000";
            string browserPath = FindBrowserApp();

            try {
                if (!string.IsNullOrEmpty(browserPath)) {
                    // Launch in clean native Desktop App Mode (No URL bar, no browser tabs, standalone window)
                    ProcessStartInfo psi = new ProcessStartInfo {
                        FileName = browserPath,
                        Arguments = string.Format("--app=\"{0}\" --window-size=1280,820", url),
                        UseShellExecute = false
                    };
                    Process.Start(psi);
                } else {
                    Process.Start(url);
                }
            } catch {
                try { Process.Start(url); } catch { }
            }
        }

        private static string FindBrowserApp() {
            string[] candidates = new string[] {
                @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
            };

            foreach (string path in candidates) {
                if (File.Exists(path)) return path;
            }
            return null;
        }

        private void OpenRecordingsFolder() {
            try {
                if (!Directory.Exists(recordingsDir)) {
                    Directory.CreateDirectory(recordingsDir);
                }
                Process.Start("explorer.exe", recordingsDir);
            } catch (Exception ex) {
                MessageBox.Show("Could not open recordings folder: " + ex.Message);
            }
        }

        private void KillProcessesOnPort(int port) {
            try {
                ProcessStartInfo psi = new ProcessStartInfo {
                    FileName = "cmd.exe",
                    Arguments = string.Format("/c for /f \"tokens=5\" %a in ('netstat -aon ^| findstr :{0} ^| findstr LISTENING') do taskkill /F /PID %a", port),
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    UseShellExecute = false
                };
                Process p = Process.Start(psi);
                if (p != null) p.WaitForExit(3000);
            } catch { }
        }

        private static bool IsPortListening(int port) {
            try {
                IPGlobalProperties ipProps = IPGlobalProperties.GetIPGlobalProperties();
                foreach (var endpoint in ipProps.GetActiveTcpListeners()) {
                    if (endpoint.Port == port) return true;
                }
            } catch { }
            return false;
        }

        private void ExitApplication() {
            if (healthCheckTimer != null) {
                healthCheckTimer.Stop();
                healthCheckTimer.Dispose();
            }

            if (notifyIcon != null) {
                notifyIcon.Visible = false;
                notifyIcon.Dispose();
            }

            StopServer();

            if (hiddenHostForm != null) {
                hiddenHostForm.Close();
                hiddenHostForm.Dispose();
            }

            Application.Exit();
        }

        private void OnApplicationExit(object sender, EventArgs e) {
            if (notifyIcon != null) {
                notifyIcon.Visible = false;
                notifyIcon.Dispose();
            }
            StopServer();
        }
    }
}

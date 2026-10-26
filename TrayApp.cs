using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace GoogleMeetRecorder {
    static class Program {
        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        static void Main() {
            try { SetProcessDPIAware(); } catch { }

            bool isNewInstance;
            using (Mutex mutex = new Mutex(true, "GoogleMeetRecorder_TrayApp_Singleton", out isNewInstance)) {
                if (!isNewInstance) {
                    try { Process.Start("http://localhost:3000"); } catch { }
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new TrayAppContext());
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

        public TrayAppContext() {
            ResolvePaths();
            InitializeTrayIcon();
            StartServer();

            // Automatically open dashboard in browser 1.5s after launch
            System.Windows.Forms.Timer openTimer = new System.Windows.Forms.Timer();
            openTimer.Interval = 1500;
            openTimer.Tick += (s, e) => {
                openTimer.Stop();
                openTimer.Dispose();
                OpenDashboard();
            };
            openTimer.Start();

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
            openItem.Click += (s, e) => OpenDashboard();
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

            Icon appIcon = null;
            string icoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app.ico");
            if (File.Exists(icoPath)) {
                try { appIcon = new Icon(icoPath); } catch { }
            }
            if (appIcon == null) {
                appIcon = SystemIcons.Application;
            }

            notifyIcon = new NotifyIcon {
                Icon = appIcon,
                ContextMenuStrip = menu,
                Text = "Google Meet Recorder (Active)",
                Visible = true
            };

            notifyIcon.DoubleClick += (s, e) => OpenDashboard();
            notifyIcon.BalloonTipClicked += (s, e) => OpenDashboard();

            notifyIcon.ShowBalloonTip(
                3000,
                "Google Meet Recorder is Running",
                "Operating in your Windows tray. Double-click to open dashboard.",
                ToolTipIcon.Info
            );
        }

        private void StartServer() {
            if (IsPortListening(3000)) {
                statusMenuItem.Text = "🟢 Status: Active (Port 3000)";
                return;
            }

            try {
                ProcessStartInfo psi = new ProcessStartInfo {
                    FileName = "cmd.exe",
                    Arguments = "/c node backend\\src\\server.js",
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

        private void OpenDashboard() {
            try {
                Process.Start("http://localhost:3000");
            } catch (Exception ex) {
                MessageBox.Show("Could not open browser: " + ex.Message);
            }
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

        private bool IsPortListening(int port) {
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

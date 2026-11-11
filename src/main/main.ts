import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import log from 'electron-log'
import { setupSettingsHandlers } from './ipc/settingsHandlers'
import { setupProfileHandlers } from './ipc/profileHandlers'
import { setupVersionHandlers } from './ipc/versionHandlers'
import { setupLaunchHandlers } from './ipc/launchHandlers'
import { setupSkinHandlers } from './ipc/skinHandlers'
import { launchService } from './services/launch'

log.initialize()
log.info('Nexus Launcher starting...')

let mainWindow: BrowserWindow | null = null
let gameSessionActive = false

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f12',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    if (!gameSessionActive) {
      mainWindow?.show()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function showLauncher() {
  gameSessionActive = false
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function hideLauncher() {
  gameSessionActive = true
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide()
  }
}

app.whenReady().then(() => {
  setupSettingsHandlers()
  setupProfileHandlers()
  setupVersionHandlers()
  setupLaunchHandlers()
  setupSkinHandlers()

  launchService.setOnGameExit((code) => {
    log.info('Game session ended, restoring launcher. exit code:', code)
    showLauncher()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('launch:game-exited', { code })
    }
  })

  ipcMain.on('launch:hide-window', () => {
    hideLauncher()
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (!gameSessionActive) {
      showLauncher()
    }
  })
})

app.on('window-all-closed', () => {
  if (gameSessionActive || launchService.isGameRunning()) {
    return
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (gameSessionActive) return
    showLauncher()
  })
}

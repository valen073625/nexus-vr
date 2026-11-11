import { app, BrowserWindow, ipcMain, shell, safeStorage } from 'electron'
import path from 'path'
import log from 'electron-log'
import { setupAuthHandlers } from './ipc/authHandlers'
import { setupLauncherHandlers } from './ipc/launcherHandlers'
import { setupVersionHandlers } from './ipc/versionHandlers'
import { setupSettingsHandlers } from './ipc/settingsHandlers'
import { setupProfileHandlers } from './ipc/profileHandlers'

log.initialize()
log.transports.file.level = 'info'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // sandbox:true bloquea safeStorage en algunos sistemas
      webSecurity: true,
    },
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  createWindow()
  setupAuthHandlers()
  setupLauncherHandlers(mainWindow!)
  setupVersionHandlers()
  setupSettingsHandlers()
  setupProfileHandlers()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

ipcMain.handle('storage:encrypt', (_event, data: string): string | null => {
  if (!safeStorage.isEncryptionAvailable()) return null
  return safeStorage.encryptString(data).toString('base64')
})

ipcMain.handle('storage:decrypt', (_event, data: string): string | null => {
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(data, 'base64'))
  } catch { return null }
})

export { mainWindow }

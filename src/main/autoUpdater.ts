import { app, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { getMainWindow } from './windowManager'

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

export function initAutoUpdater(): void {
  // electron-updater reads dev-app-update.yml / throws outside a packaged
  // build, so skip it entirely under `npm run dev`.
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  // electron-updater only registers its "install on quit" hook once, the
  // moment a download finishes, and it captures autoInstallOnAppQuit's
  // value at that exact instant (BaseUpdater.addQuitHandler) - flipping the
  // flag later, e.g. from the "나중에" button below, is too late to matter.
  // Leaving it at the library's own default (true) is what makes "나중에"
  // actually install on the next quit.
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (error) => {
    console.error('[auto-updater] 업데이트 확인 실패:', error)
  })

  autoUpdater.on('update-downloaded', (info) => {
    const win = getMainWindow()
    const options: Electron.MessageBoxOptions = {
      type: 'info',
      title: '업데이트 준비 완료',
      message: `새 버전 ${info.version}을(를) 설치할 준비가 되었습니다.`,
      detail: '지금 재시작하여 설치하시겠습니까? "나중에"를 선택하면 다음 종료 시 자동으로 설치됩니다.',
      buttons: ['지금 재시작', '나중에'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    }
    const showDialog = win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options)
    showDialog.then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall()
      }
      // else "나중에": nothing to do - the quit hook registered above already
      // installs silently on the next normal app quit.
    })
  })

  autoUpdater.checkForUpdates().catch((error) => {
    console.error('[auto-updater] 초기 업데이트 확인 실패:', error)
  })

  // IDE 특성상 앱을 오래 켜두므로 주기적으로 재확인한다.
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error('[auto-updater] 주기적 업데이트 확인 실패:', error)
    })
  }, CHECK_INTERVAL_MS)
}

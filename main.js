const { app, BrowserWindow, BrowserView } = require('electron')
const Store = require('electron-store')
const _ = require('lodash')
const store = new Store()

// store active tabs
let tabs = []
let activeTab = 0

// init bookmarks
if (!store.get('bookmarks')) {
  store.set('bookmarks', [])
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    }
  })

  win.loadFile('index.html')
  return win
}

const createTab = (win, url) => {
  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: false
    }
  })
  
  win.addBrowserView(view)
  
  const bounds = win.getBounds()
  view.setBounds({ 
    x: 250,
    y: 0,
    width: bounds.width - 250,
    height: bounds.height
  })
  
  view.setAutoResize({ width: true, height: true })
  
  // only load url if one is provided
  if (url) {
    view.webContents.loadURL(url)
  }
  
  // handle navigation events efficiently
  const updateUrl = _.debounce((url) => {
    win.webContents.send('url-update', url)
  }, 100)
  
  view.webContents.on('did-navigate', (event, url) => updateUrl(url))
  view.webContents.on('did-navigate-in-page', (event, url) => updateUrl(url))
  view.webContents.on('page-title-updated', (event, title) => {
    win.webContents.send('title-update', { index: tabs.length, title })
  })
  
  tabs.push(view)
  activeTab = tabs.length - 1
  
  return view
}

app.whenReady().then(() => {
  const mainWindow = createWindow()
  
  const { ipcMain } = require('electron')
  
  ipcMain.on('new-tab', (event, url) => {
    createTab(mainWindow, url)
  })
  
  ipcMain.on('navigate', (event, url) => {
    if (tabs[activeTab]) {
      tabs[activeTab].webContents.loadURL(url)
    }
  })
  
  ipcMain.on('switch-tab', (event, index) => {
    if (!tabs[index]) return
    
    // hide all other views first
    tabs.forEach((tab, i) => {
      if (i !== index) {
        mainWindow.removeBrowserView(tab)
      }
    })
    
    // show the selected tab
    mainWindow.addBrowserView(tabs[index])
    
    // update url bar
    mainWindow.webContents.send('url-update', tabs[index].webContents.getURL())
    
    activeTab = index
  })

  ipcMain.on('close-tab', (event, index) => {
    if (!tabs[index]) return
    
    const view = tabs[index]
    mainWindow.removeBrowserView(view)
    
    // cleanup view resources
    view.webContents.destroy()
    tabs.splice(index, 1)
    
    if (activeTab >= tabs.length) {
      activeTab = Math.max(0, tabs.length - 1)
    }
    
    // ensure active tab is visible
    if (tabs[activeTab]) {
      mainWindow.addBrowserView(tabs[activeTab])
      mainWindow.webContents.send('url-update', tabs[activeTab].webContents.getURL())
    }
    
    mainWindow.webContents.send('tabs-updated', activeTab)
  })
  
  ipcMain.on('go-back', () => {
    if (tabs[activeTab]?.webContents.canGoBack()) {
      tabs[activeTab].webContents.goBack()
    }
  })
  
  ipcMain.on('go-forward', () => {
    if (tabs[activeTab]?.webContents.canGoForward()) {
      tabs[activeTab].webContents.goForward()
    }
  })

  // bookmark handlers with efficient updates
  const updateBookmarks = _.debounce((bookmarks) => {
    mainWindow.webContents.send('bookmarks-updated', bookmarks)
  }, 100)

  ipcMain.on('add-bookmark', (event, bookmark) => {
    const bookmarks = store.get('bookmarks')
    store.set('bookmarks', [...bookmarks, { ...bookmark, id: Date.now() }])
    updateBookmarks(store.get('bookmarks'))
  })

  ipcMain.on('get-bookmarks', (event) => {
    event.reply('bookmarks-updated', store.get('bookmarks'))
  })

  ipcMain.on('remove-bookmark', (event, id) => {
    const bookmarks = store.get('bookmarks')
    store.set('bookmarks', bookmarks.filter(b => b.id !== id))
    updateBookmarks(store.get('bookmarks'))
  })

  ipcMain.on('update-bookmark', (event, { id, newTitle }) => {
    const bookmarks = store.get('bookmarks')
    const updated = bookmarks.map(b => 
      b.id === id ? { ...b, title: newTitle } : b
    )
    store.set('bookmarks', updated)
    updateBookmarks(updated)
  })

  // handle window resizing more efficiently
  const updateBounds = _.debounce(() => {
    const bounds = mainWindow.getBounds()
    tabs.forEach(tab => {
      tab.setBounds({ 
        x: 250,
        y: 0,
        width: bounds.width - 250,
        height: bounds.height
      })
    })
  }, 100)

  mainWindow.on('resize', updateBounds)
})
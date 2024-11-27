const { ipcRenderer } = require('electron')
const _ = require('lodash')

let tabs = ['New Tab']
let activeTab = 0

// debounce tab rendering for performance
const renderTabs = _.debounce(() => {
  requestAnimationFrame(() => {
    const tabsDiv = document.getElementById('tabs')
    const fragment = document.createDocumentFragment()
    
    tabs.forEach((tab, i) => {
      const div = document.createElement('div')
      div.className = `tab ${i === activeTab ? 'active' : ''}`
      div.onclick = () => switchTab(i)
      div.textContent = tab
      fragment.appendChild(div)
    })
    
    tabsDiv.replaceChildren(fragment)
  })
}, 16)

function normalize(input) {
  if (input.includes(' ')) {
    return `https://www.google.com/search?q=${encodeURIComponent(input)}`
  }
  if (/^[\w-]+(\.[\w-]+)+$/.test(input)) {
    return `https://${input}`
  }
  if (input.startsWith('www.')) {
    return `https://${input}`
  }
  if (!/^[a-zA-Z]+:\/\//.test(input)) {
    return `https://${input}`
  }
  return input
}

function navigate(input) {
  const url = normalize(input)
  console.log('Navigating to:', url)
  ipcRenderer.send('navigate', url)
}

function newTab() {
  console.log('Creating new tab')
  const newIndex = tabs.length
  tabs.push('New Tab')
  switchTab(newIndex)
  ipcRenderer.send('new-tab')
  // clear and focus url bar
  const urlBar = document.getElementById('url-bar')
  urlBar.value = ''
  urlBar.focus()
}

function switchTab(index) {
  activeTab = index
  renderTabs()
  ipcRenderer.send('switch-tab', index)
}

function closeTab(index) {
  if (tabs.length === 1) return
  ipcRenderer.send('close-tab', index)
  tabs.splice(index, 1)
  if (activeTab >= tabs.length) {
    activeTab = Math.max(0, tabs.length - 1)
  }
  renderTabs()
}

function handleUrl(event) {
  if (event.key === 'Enter') {
    navigate(event.target.value)
  }
}

function addBookmark() {
  const url = document.getElementById('url-bar').value
  const title = tabs[activeTab]
  ipcRenderer.send('add-bookmark', { url, title })
}

function editBookmark(id, currentTitle) {
  const span = event.target
  const input = document.createElement('input')
  input.value = currentTitle
  input.className = 'bookmark-edit'
  
  span.parentNode.replaceChild(input, span)
  input.focus()
  
  const saveEdit = () => {
    const newTitle = input.value.trim()
    if (newTitle && newTitle !== currentTitle) {
      ipcRenderer.send('update-bookmark', { id, newTitle })
    } else {
      span.parentNode.replaceChild(span, input)
    }
  }

  input.onblur = saveEdit
  input.onkeydown = (e) => {
    if (e.key === 'Enter') saveEdit()
    if (e.key === 'Escape') span.parentNode.replaceChild(span, input)
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, setting up handlers')

  // Global keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // log the key combo
    console.log('Keydown:', {
      key: e.key,
      metaKey: e.metaKey,
      ctrlKey: e.ctrlKey
    })
    
    if ((e.metaKey || e.ctrlKey) && e.key === 't') {
      console.log('New tab shortcut triggered')
      e.preventDefault()
      newTab()
    }
    
    if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
      e.preventDefault()
      closeTab(activeTab)
    }
    
    if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
      e.preventDefault()
      addBookmark()
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
      e.preventDefault()
      document.getElementById('url-bar').select()
    }
  })

  ipcRenderer.send('get-bookmarks')
  renderTabs()
})

// IPC Listeners
function getTabName(url, title) {
  if (!url && !title) return 'New Tab'
  
  try {
    // try to get domain from url
    if (url) {
      const domain = new URL(url).hostname
        .replace('www.', '')
        .split('.')[0]
      return domain.charAt(0).toUpperCase() + domain.slice(1)
    }
  } catch (e) {}
  
  // fallback to first few words of title
  if (title) {
    return title.split(/[\s-]+/)[0]
  }
  
  return 'New Tab'
}

ipcRenderer.on('title-update', (event, {index, title}) => {
  if (tabs[index]) {
    const url = document.getElementById('url-bar').value
    tabs[index] = getTabName(url, title)
    renderTabs()
  }
})

ipcRenderer.on('bookmarks-updated', (event, bookmarks) => {
  const list = document.getElementById('bookmark-list')
  const fragment = document.createDocumentFragment()
  
  bookmarks.forEach(b => {
    const div = document.createElement('div')
    div.className = 'bookmark'
    div.innerHTML = `
      <span 
        class="bookmark-title" 
        ondblclick="editBookmark(${b.id}, '${b.title}')"
        onclick="navigateToBookmark('${b.url}')"
      >${b.title}</span>
      <button onclick="removeBookmark(${b.id})">×</button>
    `
    fragment.appendChild(div)
  })
  
  list.replaceChildren(fragment)
})

ipcRenderer.on('tabs-updated', (event, newActiveTab) => {
  activeTab = newActiveTab
  renderTabs()
})

ipcRenderer.on('url-update', (event, url) => {
  document.getElementById('url-bar').value = url
})

// Export functions to global scope
globalThis.handleUrl = handleUrl
globalThis.goBack = () => ipcRenderer.send('go-back')
globalThis.goForward = () => ipcRenderer.send('go-forward')
globalThis.navigateToBookmark = url => ipcRenderer.send('navigate', url)
globalThis.removeBookmark = id => ipcRenderer.send('remove-bookmark', id)
globalThis.editBookmark = editBookmark
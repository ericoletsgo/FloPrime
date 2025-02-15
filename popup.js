let player;
let lastPopupTime = null;

// Centralized state management
const AppState = {
  async initialize() {
    const stored = await chrome.storage.local.get([
      'extensionEnabled',
      'playlists',
      'pomodoroEnabled'
    ]);
    
    return {
      extensionEnabled: stored.extensionEnabled ?? false,
      playlists: stored.playlists ?? [],
      pomodoroEnabled: stored.pomodoroEnabled ?? false
    };
  },
  
  async setState(updates) {
    await chrome.storage.local.set(updates);
  }
};

// Rate limiter for API calls
const rateLimiter = {
  lastCall: 0,
  minInterval: 1000, 
  
  async throttle() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;
    
    if (timeSinceLastCall < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastCall));
    }
    
    this.lastCall = Date.now();
  }
};

// Notification manager
const NotificationManager = {
  lastNotification: null,
  minInterval: 5 * 60 * 1000, 
  
  canShowNotification() {
    const now = Date.now();
    return !this.lastNotification || (now - this.lastNotification) >= this.minInterval;
  },
  
  async show(title, message) {
    if (!this.canShowNotification()) return;
    
    this.lastNotification = Date.now();
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title,
      message,
      priority: 2
    });
  }
};

// Fetch with retry logic
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
}

// Fetch YouTube API Key securely
async function getApiKey() {
  try {
    const state = await AppState.initialize();
    if (!state.extensionEnabled) return null;
    
    const data = await fetchWithRetry('env.json');
    return data.YOUTUBE_API_KEY;
  } catch (error) {
    console.error('Error fetching API key:', error);
    return null;
  }
}

// Fetch playlist details from YouTube API
async function fetchPlaylistDetails(playlistId) {
  try {
    const state = await AppState.initialize();
    if (!state.extensionEnabled) return null;
    
    await rateLimiter.throttle();
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error('API key not found');
    
    const data = await fetchWithRetry(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${apiKey}`
    );
    
    if (data.items && data.items.length > 0) {
      return {
        id: playlistId,
        name: data.items[0].snippet.title,
        videos: []
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching playlist details:', error);
    return null;
  }
}

// Fetch playlist videos from YouTube API
async function fetchPlaylistVideos(playlist) {
  try {
    const state = await AppState.initialize();
    if (!state.extensionEnabled) return [];
    
    await rateLimiter.throttle();
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error('API key not found');
    
    const data = await fetchWithRetry(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlist.id}&key=${apiKey}`
    );
    
    return data.items.map(item => item.snippet.resourceId.videoId);
  } catch (error) {
    console.error('Error fetching playlist videos:', error);
    return [];
  }
}

// Get shuffled video from playlists
async function getShuffledVideo() {
  const state = await AppState.initialize();
  if (!state.extensionEnabled) return null;

  try {
    const data = await chrome.storage.local.get("playlists");
    let allVideos = [];

    if (data.playlists?.length > 0) {
      for (const playlist of data.playlists) {
        if (playlist.videos.length === 0) {
          playlist.videos = await fetchPlaylistVideos(playlist);
        }
        allVideos = allVideos.concat(playlist.videos);
      }
    }

    return allVideos.length > 0 
      ? allVideos[Math.floor(Math.random() * allVideos.length)]
      : null;
  } catch (error) {
    console.error('Error getting shuffled video:', error);
    return null;
  }
}

// Schedule checking
function isScheduledTime(date = new Date()) {
  const minutes = date.getMinutes();
  const isBreakTime = minutes === 25 || minutes === 55;
  const isWorkTime = minutes === 0 || minutes === 30;
  
  return {
    isBreakTime,
    isWorkTime,
    type: isBreakTime ? 'break' : (isWorkTime ? 'work' : null)
  };
}

// Check schedule and trigger appropriate actions
async function checkVideoSchedule() {
  const state = await AppState.initialize();
  if (!state.extensionEnabled) {
    console.log("Extension is disabled. Skipping schedule check.");
    return;
  }

  const now = new Date();
  const schedule = isScheduledTime(now);
  
  if (schedule.isBreakTime && (!lastPopupTime || now - lastPopupTime >= 5 * 60 * 1000)) {
    await openShuffledVideoPopup();
    lastPopupTime = now;
    await NotificationManager.show("Rest your eyes and body", "It's time to take a break!");
  }
  
  if (schedule.isWorkTime) {
    await NotificationManager.show("Reminder", "Time to get back to work!");
  }
}

// Open video popup
async function openShuffledVideoPopup() {
  const state = await AppState.initialize();
  if (!state.extensionEnabled) {
    console.log("Extension is disabled. Skipping video popup.");
    return;
  }

  try {
    const videoId = await getShuffledVideo();
    if (videoId) {
      await chrome.tabs.create({ url: `https://www.youtube.com/embed/${videoId}?autoplay=1` });
    } else {
      console.log('No videos available in the playlists.');
    }
  } catch (error) {
    console.error('Error opening video popup:', error);
  }
}

// Set up alarm and listeners
chrome.alarms.create('checkVideoSchedule', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkVideoSchedule') {
    checkVideoSchedule();
  }
});

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.action === "togglePomodoro") {
    await AppState.setState({ pomodoroEnabled: message.enabled });
    console.log("Pomodoro Enabled:", message.enabled);
  }
});

// Storage quota management
async function checkStorageQuota() {
  if (navigator.storage?.estimate) {
    try {
      const {usage, quota} = await navigator.storage.estimate();
      const percentageUsed = (usage / quota) * 100;
      
      if (percentageUsed > 80) {
        console.warn(`Storage usage is high (${percentageUsed.toFixed(2)}%)`);
        // Could implement cleanup here
      }
    } catch (error) {
      console.error('Error checking storage quota:', error);
    }
  }
}

// Check storage quota periodically
setInterval(checkStorageQuota, 24 * 60 * 60 * 1000); // Once per day

// Initialize state on popup load
document.addEventListener('DOMContentLoaded', async () => {
  const state = await AppState.initialize();
  updateUIState('loading', 'Initializing...');
  
  try {
    initializeEventListeners();
    await displayPlaylists();
    if (state.extensionEnabled) {
      await loadYouTubeAPI();
    }
    updateExtensionEnabledDisplay(state.extensionEnabled);
    updateUIState('idle');
  } catch (error) {
    console.error('Error initializing popup:', error);
    updateUIState('error', 'Failed to initialize. Please try again.');
  }
});

function updateUIState(state = 'idle', message = '') {
  const statusElement = document.getElementById('status-message') || 
    (() => {
      const el = document.createElement('div');
      el.id = 'status-message';
      document.body.appendChild(el);
      return el;
    })();
    
  statusElement.textContent = message;
  document.body.setAttribute('data-state', state);
}

function validatePlaylistUrl(url) {
  try {
    const urlObj = new URL(url);
    const playlistId = urlObj.searchParams.get('list');
    if (!playlistId) throw new Error('No playlist ID found');
    return playlistId;
  } catch {
    return null;
  }
}

function initializeEventListeners() {
  const toggleButton = document.getElementById('toggle-extension');
  const addPlaylistButton = document.getElementById('add-playlist');
  const openVideoButton = document.getElementById('open-video-manual');
  
  toggleButton.addEventListener('click', toggleExtensionEnabled);
  addPlaylistButton.addEventListener('click', handleAddPlaylist);
  openVideoButton.addEventListener('click', handleOpenVideo);
  
  window.addEventListener('unload', () => {
    toggleButton.removeEventListener('click', toggleExtensionEnabled);
    addPlaylistButton.removeEventListener('click', handleAddPlaylist);
    openVideoButton.removeEventListener('click', handleOpenVideo);
  });
}

async function handleAddPlaylist() {
  const playlistUrl = document.getElementById("playlist-url").value.trim();
  const playlistId = validatePlaylistUrl(playlistUrl);
  
  if (!playlistId) {
    alert('Please enter a valid YouTube playlist URL');
    return;
  }
  
  updateUIState('loading', 'Adding playlist...');
  try {
    await storePlaylist(playlistId);
    document.getElementById("playlist-url").value = '';
    updateUIState('idle', 'Playlist added successfully');
  } catch (error) {
    console.error('Error adding playlist:', error);
    updateUIState('error', 'Failed to add playlist. Please try again.');
  }
}

async function handleOpenVideo() {
  const state = await AppState.initialize();
  if (!state.extensionEnabled) {
    alert('Extension is disabled.');
    return;
  }
  
  updateUIState('loading', 'Opening video...');
  try {
    await openShuffledVideoPopup();
    updateUIState('idle');
  } catch (error) {
    console.error('Error opening video:', error);
    updateUIState('error', 'Failed to open video. Please try again.');
  }
}

// Modify the storePlaylist function
async function storePlaylist(playlistId) {
  updateUIState('loading', 'Fetching playlist details...');
  try {
    const playlistDetails = await fetchPlaylistDetails(playlistId);
    if (!playlistDetails) {
      throw new Error('Could not fetch playlist details');
    }

    const state = await AppState.initialize();
    const playlists = [...state.playlists, playlistDetails];
    await AppState.setState({ playlists });
    
    updateUIState('loading', 'Fetching playlist videos...');
    const videos = await fetchPlaylistVideos(playlistDetails);
    
    const updatedPlaylists = playlists.map(p => 
      p.id === playlistId ? { ...p, videos } : p
    );
    
    await AppState.setState({ playlists: updatedPlaylists });
    await displayPlaylists();
    updateUIState('idle', 'Playlist added successfully');
  } catch (error) {
    console.error('Error storing playlist:', error);
    updateUIState('error', 'Failed to add playlist. Please try again.');
  }
}

// Update the displayPlaylists function
async function displayPlaylists() {
  const state = await AppState.initialize();
  const playlistList = document.getElementById('playlist-list');
  playlistList.innerHTML = '';

  state.playlists.forEach((playlist, index) => {
    const listItem = document.createElement('li');
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = playlist.name || `Playlist ${index + 1}`;
    nameSpan.className = 'playlist-name';
    
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.classList.add('remove-playlist');
    removeBtn.onclick = () => removePlaylist(index);

    listItem.appendChild(nameSpan);
    listItem.appendChild(removeBtn);
    playlistList.appendChild(listItem);
  });

  console.log('Playlists displayed:', state.playlists);
}

async function removePlaylist(index) {
  const state = await AppState.initialize();
  const playlists = state.playlists.filter((_, i) => i !== index);
  await AppState.setState({ playlists });
  await displayPlaylists();
}

async function toggleExtensionEnabled() {
  const state = await AppState.initialize();
  const extensionEnabled = !state.extensionEnabled;
  
  await AppState.setState({ extensionEnabled });
  updateExtensionEnabledDisplay(extensionEnabled);
  
  if (extensionEnabled) {
    await loadYouTubeAPI();
  }
}

function updateExtensionEnabledDisplay(enabled) {
  const status = enabled ? "Enabled" : "Disabled";
  document.getElementById('extension-status').textContent = `Extension is ${status}`;
}

function loadYouTubeAPI() {
  if (!document.getElementById('youtube-api')) {
    const script = document.createElement('script');
    script.src = "https://www.youtube.com/iframe_api";
    script.id = 'youtube-api';
      }
}

// YouTube Player functions
function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    videoId: 'BV-PA9gYrI4',
    events: {
      'onReady': onPlayerReady,
      'onStateChange': onPlayerStateChange
    }
  });
}

function onPlayerReady(event) {
  event.target.setPlaybackRate(3);
  event.target.playVideo();
}

function onPlayerStateChange(event) {
  // Handle player state changes
}

function changeSpeed(speed) {
  if (player) {
    player.setPlaybackRate(speed);
  }
}
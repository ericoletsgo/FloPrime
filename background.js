let lastPopupTime = null;

// Using State now
const AppState = {
  async initialize() {
    const stored = await chrome.storage.local.get([
      'extensionEnabled',
      'playlists',
      'pomodoroEnabled'
    ]);
    
    return {
      extensionEnabled: stored.extensionEnabled ?? true,
      playlists: stored.playlists ?? [],
      pomodoroEnabled: stored.pomodoroEnabled ?? false
    };
  },
  
  async setState(updates) {
    await chrome.storage.local.set(updates);
  }
};

// Limit Api calls
const RateLimiter = {
  lastCall: 0,
  minInterval: 1000,
  
  async throttle() {
    const now = Date.now();
    const timeToWait = Math.max(0, this.minInterval - (now - this.lastCall));
    
    if (timeToWait > 0) {
      await new Promise(resolve => setTimeout(resolve, timeToWait));
    }
    
    this.lastCall = Date.now();
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
      await new Promise(resolve => 
        setTimeout(resolve, 1000 * Math.pow(2, i))
      );
    }
  }
}

// API Key Management
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

// Add this function to fetch playlist details
async function fetchPlaylistDetails(playlistId) {
  try {
    const state = await AppState.initialize();
    if (!state.extensionEnabled) return null;
    
    await RateLimiter.throttle();
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

// Modify the fetchPlaylistVideos function to include playlist name
async function fetchPlaylistVideos(playlist) {
  try {
    const state = await AppState.initialize();
    if (!state.extensionEnabled) return [];
    
    await RateLimiter.throttle();
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

// Video Selection
async function getShuffledVideo() {
  const state = await AppState.initialize();
  if (!state.extensionEnabled) return null;

  try {
    const data = await chrome.storage.local.get("playlists");
    let allVideos = [];

    if (data.playlists?.length > 0) {
      for (const playlist of data.playlists) {
        if (!playlist.videos?.length) {
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

// Schedule Management
function isScheduledTime(date = new Date()) {
  const minutes = date.getMinutes();
  return {
    isBreakTime: minutes === 25 || minutes === 55,
    isWorkTime: minutes === 0 || minutes === 30
  };
}

// Notification Management
const NotificationManager = {
  lastNotification: null,
  minInterval: 5 * 60 * 1000,
  
  canShowNotification() {
    const now = Date.now();
    return !this.lastNotification || 
           (now - this.lastNotification) >= this.minInterval;
  },
  
  async show(title, message) {
    if (!this.canShowNotification()) return;
    
    this.lastNotification = Date.now();
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title,
      message,
      priority: 2
    });
  }
};

// Schedule Checking
async function checkVideoSchedule() {
  const state = await AppState.initialize();
  if (!state.extensionEnabled) {
    console.log("Extension is disabled. Skipping schedule check.");
    return;
  }

  const now = new Date();
  const schedule = isScheduledTime(now);
  
  if (schedule.isBreakTime && 
      (!lastPopupTime || now - lastPopupTime >= 5 * 60 * 1000)) {
    await openShuffledVideoPopup();
    lastPopupTime = now;
    await NotificationManager.show(
      "Rest your eyes and body", 
      "It's time to take a break!"
    );
  }
  
  if (schedule.isWorkTime) {
    await NotificationManager.show(
      "Back to Work", 
      "Break time is over!"
    );
  }
}

// Video Popup Management
async function openShuffledVideoPopup() {
  const state = await AppState.initialize();
  if (!state.extensionEnabled) {
    console.log("Extension is disabled. Skipping video popup.");
    return;
  }

  try {
    const videoId = await getShuffledVideo();
    if (videoId) {
      await chrome.tabs.create({ 
        url: `https://www.youtube.com/embed/${videoId}?autoplay=1`
      });
    } else {
      console.log('No videos available in the playlists.');
    }
  } catch (error) {
    console.error('Error opening video popup:', error);
  }
}

// Storage Management
async function checkStorageQuota() {
  if (navigator.storage?.estimate) {
    try {
      const {usage, quota} = await navigator.storage.estimate();
      const percentageUsed = (usage / quota) * 100;
      
      if (percentageUsed > 80) {
        console.warn(`Storage usage is high (${percentageUsed.toFixed(2)}%)`);
        // Implement cleanup if needed
      }
    } catch (error) {
      console.error('Error checking storage quota:', error);
    }
  }
}

// Initialize alarms and listeners
chrome.alarms.create('checkVideoSchedule', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkVideoSchedule') {
    checkVideoSchedule();
  }
});

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.action === "togglePomodoro") {
    await AppState.setState({ pomodoroEnabled: message.enabled });
  }
});

// setup
(async () => {
  await AppState.initialize();
  await checkStorageQuota();
})();

// storage check
setInterval(checkStorageQuota, 24 * 60 * 60 * 1000);
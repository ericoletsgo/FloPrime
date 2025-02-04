let lastPopupTime = null;

// Fetch YouTube API Key securely
async function getApiKey() {
  const response = await fetch('env.json');
  const data = await response.json();
  return data.YOUTUBE_API_KEY;
}

// Fetch playlist videos from YouTube API
async function fetchPlaylistVideos(playlistId) {
  const apiKey = await getApiKey();
  const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}`);
  const data = await response.json();
  const videos = data.items.map(item => item.snippet.resourceId.videoId);
  return videos;
}

// Get shuffled video from playlists
function getShuffledVideo() {
  return new Promise((resolve) => {
    chrome.storage.local.get("playlists", async (data) => {
      let allVideos = [];

      if (data.playlists && data.playlists.length > 0) {
        for (const playlist of data.playlists) {
          if (playlist.videos.length === 0) {
            playlist.videos = await fetchPlaylistVideos(playlist.playlistId);
          }
          allVideos = allVideos.concat(playlist.videos);
        }
      }

      if (allVideos.length > 0) {
        resolve(allVideos[Math.floor(Math.random() * allVideos.length)]);
      } else {
        resolve(null);
      }
    });
  });
}

// Function to check current time and trigger video popup at 25 and 55 minutes past the hour
function checkVideoSchedule() {
  const now = new Date();
  const minutes = now.getMinutes();

  if ((minutes === 25 || minutes === 55) && (!lastPopupTime || now - lastPopupTime >= 5 * 60 * 1000)) {
    openShuffledVideoPopup();
    lastPopupTime = now;
  }
  if (minutes === 0 || minutes === 30) {
    sendNotification("Reminder", "Time to get back to work!");
  }
}

// Function to open shuffled video popup
async function openShuffledVideoPopup() {
  const videoId = await getShuffledVideo();
  if (videoId) {
    chrome.tabs.create({ url: `https://www.youtube.com/embed/${videoId}?autoplay=1` });
  } else {
    console.log('No videos available in the playlists.');
  }
}

// Function to send a notification
function sendNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: title,
    message: message,
    priority: 2
  });
}

// Set up an alarm to wake up the service worker every minute
chrome.alarms.create('checkVideoSchedule', { periodInMinutes: 1 });

// Listen for the alarm to trigger the checkVideoSchedule function
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkVideoSchedule') {
    checkVideoSchedule();
  }
});

// Function to enable/disable Pomodoro
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "togglePomodoro") {
    chrome.storage.local.set({ pomodoroEnabled: message.enabled });
    console.log("Pomodoro Enabled:", message.enabled);
  }
});
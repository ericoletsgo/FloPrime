let playlists = JSON.parse(localStorage.getItem('playlists')) || [];
let player;
let disableStartTime = JSON.parse(localStorage.getItem('disableStartTime')) || 0;
let disableEndTime = JSON.parse(localStorage.getItem('disableEndTime')) || 0;

// Initialize YouTube Player when API is ready
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

function changeSpeed(speed) {
  if (player) {
    player.setPlaybackRate(speed);
  }
}

// Fetch YouTube API Key from env.json
async function getApiKey() {
  const response = await fetch('env.json');
  const data = await response.json();
  return data.YOUTUBE_API_KEY;
}

// Store playlist in localStorage
function storePlaylist(playlistId) {
  playlists.push({ playlistId, videos: [] });
  localStorage.setItem('playlists', JSON.stringify(playlists));
  fetchPlaylistVideos(playlistId);
  displayPlaylists();
}

async function fetchPlaylistVideos(playlistId) {
  const apiKey = await getApiKey();
  const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}`);
  const data = await response.json();
  const videos = data.items.map(item => item.snippet.resourceId.videoId);
  const playlist = playlists.find(pl => pl.playlistId === playlistId);
  if (playlist) {
    playlist.videos = videos;
    localStorage.setItem('playlists', JSON.stringify(playlists));
    chrome.storage.local.set({ playlists });
  }
}

function displayPlaylists() {
  const playlistList = document.getElementById('playlist-list');
  playlistList.innerHTML = ''; // Clear list before re-rendering

  playlists.forEach((playlist, index) => {
    const listItem = document.createElement('li');
    listItem.textContent = `Playlist ${index + 1}: ${playlist.playlistId}`;

    // Create the remove button
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.dataset.index = index; // Store index in a dataset attribute
    removeBtn.classList.add('remove-playlist');

    listItem.appendChild(removeBtn);
    playlistList.appendChild(listItem);
  });

  // Attach event listener for removing playlist
  document.querySelectorAll('.remove-playlist').forEach((button) => {
    button.addEventListener('click', function () {
      const index = this.dataset.index;
      removePlaylist(index);
    });
  });
}

// Remove a playlist
function removePlaylist(index) {
  playlists.splice(index, 1);
  localStorage.setItem('playlists', JSON.stringify(playlists));
  chrome.storage.local.set({ playlists });
  displayPlaylists();
}

function getShuffledVideo() {
  return new Promise((resolve) => {
    chrome.storage.local.get("playlists", (data) => {
      let allVideos = [];

      if (data.playlists && data.playlists.length > 0) {
        allVideos = data.playlists.flatMap(playlist => playlist.videos);
      }

      if (allVideos.length > 0) {
        resolve(allVideos[Math.floor(Math.random() * allVideos.length)]);
      } else {
        resolve(null);
      }
    });
  });
}

// Open video manually in a new tab (for testing purposes)
document.getElementById("open-video-manual").addEventListener("click", async function() {
  const videoId = await getShuffledVideo();
  if (videoId) {
    window.open(`https://www.youtube.com/embed/${videoId}?autoplay=1`, '_blank');
  } else {
    alert('No videos available in the playlists.');
  }
});

document.getElementById("add-playlist").addEventListener("click", function() {
  const playlistUrl = document.getElementById("playlist-url").value;
  const playlistId = playlistUrl.split("list=")[1];
  if (playlistId) {
    storePlaylist(playlistId);
  }
});

function loadYouTubeAPI() {
  if (!document.getElementById('youtube-api')) {
    const script = document.createElement('script');
    script.src = "https://www.youtube.com/iframe_api";
    script.id = 'youtube-api';
      }
}

// Function to check if the current time is within the disable period
function isWithinDisablePeriod() {
  const now = new Date();
  const currentHour = now.getHours();

  if (disableStartTime < disableEndTime) {
    return currentHour >= disableStartTime && currentHour < disableEndTime;
  } else {
    return currentHour >= disableStartTime || currentHour < disableEndTime;
  }
}

// Function to check current time and trigger video popup at 25 and 55 minutes past the hour
function checkVideoSchedule() {
  if (isWithinDisablePeriod()) {
    console.log("Within disable period. No action taken.");
    return;
  }

  const now = new Date();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  console.log(`Current time: ${now.getHours()}:${minutes}:${seconds}`);

  if ((minutes === 25 || minutes === 55) && (!lastPopupTime || now - lastPopupTime >= 5 * 60 * 1000)) {
    console.log("Triggering video popup");
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
    iconUrl: 'Extension/icons/icon48.png', // Ensure this path is correct
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
displayPlaylists();
loadYouTubeAPI();

// Update disable times display
function updateDisableTimesDisplay() {
  document.getElementById('disable-start-time').textContent = `Disable Start Time: ${disableStartTime}:00`;
  document.getElementById('disable-end-time').textContent = `Disable End Time: ${disableEndTime}:00`;
}

// Increase or decrease disable start time
function changeDisableStartTime(increment) {
  disableStartTime = (disableStartTime + increment + 24) % 24;
  localStorage.setItem('disableStartTime', JSON.stringify(disableStartTime));
  updateDisableTimesDisplay();
}

// Increase or decrease disable end time
function changeDisableEndTime(increment) {
  disableEndTime = (disableEndTime + increment + 24) % 24;
  localStorage.setItem('disableEndTime', JSON.stringify(disableEndTime));
  updateDisableTimesDisplay();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('disable-start-time-up').addEventListener('click', () => changeDisableStartTime(1));
  document.getElementById('disable-start-time-down').addEventListener('click', () => changeDisableStartTime(-1));
  document.getElementById('disable-end-time-up').addEventListener('click', () => changeDisableEndTime(1));
  document.getElementById('disable-end-time-down').addEventListener('click', () => changeDisableEndTime(-1));

  // Initialize disable times display
  updateDisableTimesDisplay();
});
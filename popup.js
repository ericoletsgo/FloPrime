// Store playlists in localStorage
let playlists = JSON.parse(localStorage.getItem('playlists')) || [];
let player;

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

// Function to check current time and trigger video popup at 25 and 55 minutes past the hour
function checkVideoSchedule() {
  const now = new Date();
  const minutes = now.getMinutes();
  console.log(`Current time: ${now.getHours()}:${minutes}`);

  if (minutes === 25 || minutes === 55) {
    console.log("Triggering video popup");
    openShuffledVideoPopup();
  }
}

// Function to open shuffled video popup
async function openShuffledVideoPopup() {
  const videoId = await getShuffledVideo();
  if (videoId) {
    window.open(`https://www.youtube.com/embed/${videoId}?autoplay=1`, '_blank');
  } else {
    alert('No videos available in the playlists.');
  }
}

// Run video schedule check every minute
setInterval(checkVideoSchedule, 60 * 1000);

// Initialize UI on popup load
displayPlaylists();
loadYouTubeAPI();
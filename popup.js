// Store playlists in localStorage
let playlists = JSON.parse(localStorage.getItem('playlists')) || [];  // Fetch saved playlists
let isPomodoroActive = true;  // Control whether Pomodoro is running
let player;  // YouTube player instance

// Initialize the YouTube Player when the API is ready
function onYouTubeIframeAPIReady() {
  player = new YT.Player('player', {
    videoId: 'BV-PA9gYrI4',  // Example video ID to start
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

function startPomodoro() {
  const now = new Date();
  const nextHour = new Date(now.setMinutes(0, 0, 0));  // Get next hour
  const timeUntilNextHour = nextHour - now;

  setTimeout(() => {
    startFocusSession();
    setInterval(pomodoroCycle, 60 * 60 * 1000);  // Repeat every hour
  }, timeUntilNextHour);
}

function pomodoroCycle() {
  if (isPomodoroActive) {
    startFocusSession();
  }
}

function startFocusSession() {
  // Focus session - 25 minutes
  setTimeout(startBreakSession, 25 * 60 * 1000); // After 25 mins, start break
}

function startBreakSession() {
  openBreakPopup();  // Open the break popup with shuffled video
  setTimeout(startFocusSession, 5 * 60 * 1000);  // After 5 minutes, start focus again
}

function openBreakPopup() {
  const videoId = shuffleVideos()[0];  // Get shuffled video
  const popup = window.open('', '', 'width=800, height=600');
  popup.document.write(`
    <iframe width="100%" height="100%" 
      src="https://www.youtube.com/embed/${videoId}?autoplay=1" 
      frameborder="0" allow="autoplay; fullscreen" allowfullscreen>
    </iframe>
  `);
}

function shuffleVideos() {
  let allVideos = playlists.flatMap(playlist => playlist.videos);  // Combine videos from all playlists
  for (let i = allVideos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allVideos[i], allVideos[j]] = [allVideos[j], allVideos[i]];  // Shuffle videos
  }
  return allVideos;
}

// Function to fetch playlist videos from the YouTube API
async function fetchPlaylistVideos(playlistId) {
    const apiKey = 'YOUR_YOUTUBE_API_KEY';  // Replace this with your actual API key
    const apiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}`;
  
    try {
      const response = await fetch(apiUrl);
      const data = await response.json();
      const videoIds = data.items.map(item => item.snippet.resourceId.videoId);
      return videoIds;  // Returns an array of video IDs
    } catch (error) {
      console.error('Error fetching playlist data:', error);
      return [];  // Return an empty array in case of an error
    }
  }

  // Store playlist data in localStorage
function storePlaylist(playlistId) {
    fetchPlaylistVideos(playlistId).then(videoIds => {
      let playlists = JSON.parse(localStorage.getItem('playlists')) || [];
      playlists.push({ playlistId, videos: videoIds });
      localStorage.setItem('playlists', JSON.stringify(playlists));
      displayPlaylists();  // Display updated playlists
    });
  }

// Display the playlists from localStorage
function displayPlaylists() {
    const playlistList = document.getElementById('playlist-list');
    playlistList.innerHTML = '';  // Clear existing list
  
    const playlists = JSON.parse(localStorage.getItem('playlists')) || [];
    playlists.forEach((playlist, index) => {
      const listItem = document.createElement('li');
      listItem.textContent = `Playlist ${index + 1}: ${playlist.playlistId}`;
      playlistList.appendChild(listItem);
    });
  }
  

// Open video manually in a new tab (for testing purposes)
document.getElementById('open-video-manual').addEventListener('click', function() {
    const videoId = shuffleVideos()[0];  // Get a shuffled video ID
    const popup = window.open('', '', 'width=800, height=600');
    popup.document.write(`
      <iframe width="100%" height="100%" 
        src="https://www.youtube.com/embed/X_fZraQFnyI?si=o-scQdSy8_uQAqNT?autoplay=1" 
        frameborder="0" allow="autoplay; fullscreen" allowfullscreen>
      </iframe>
    `);
  });
  

// Add Playlist URL and store it
function addPlaylist(url) {
  const playlist = {
    url,
    videos: ['videoId1', 'videoId2', 'videoId3']  // Dummy video IDs (replace with real data)
  };
  playlists.push(playlist);
  localStorage.setItem('playlists', JSON.stringify(playlists));
  displayPlaylists();
}

// Display the playlists
function displayPlaylists() {
  const playlistList = document.getElementById('playlist-list');
  playlistList.innerHTML = '';
  playlists.forEach((playlist, index) => {
    const listItem = document.createElement('li');
    listItem.textContent = `Playlist ${index + 1}: ${playlist.url}`;
    playlistList.appendChild(listItem);
  });
}

// Event listener for adding playlist
document.getElementById('add-playlist').addEventListener('click', function () {
  const url = document.getElementById('playlist-url').value;
  if (url) {
    addPlaylist(url);
    document.getElementById('playlist-url').value = '';  // Clear input field
  } else {
    alert('Please enter a valid playlist URL');
  }
});

// Speed control buttons
document.getElementById('increase-speed').addEventListener('click', function () {
  const currentSpeed = player.getPlaybackRate();
  changeSpeed(currentSpeed + 0.25);
});

document.getElementById('decrease-speed').addEventListener('click', function () {
  const currentSpeed = player.getPlaybackRate();
  changeSpeed(currentSpeed - 0.25);
});

document.getElementById('reset-speed').addEventListener('click', function () {
  changeSpeed(1.0);  // Reset to normal speed
});

// Disable Pomodoro button
document.getElementById('disable-pomodoro').addEventListener('click', function () {
  isPomodoroActive = false;
  alert('Pomodoro timer has been disabled.');
});

// Display saved playlists when the popup opens
displayPlaylists();
startPomodoro();  // Start the Pomodoro timer

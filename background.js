console.log("Background script loaded");

// ✅ Default state (Pomodoro is enabled)
chrome.storage.local.set({ pomodoroEnabled: true });

// ✅ Function to check current time and trigger Pomodoro at fixed intervals
function checkPomodoroSchedule() {
  chrome.storage.local.get("pomodoroEnabled", (data) => {
    if (!data.pomodoroEnabled) return;  // Stop if Pomodoro is disabled

    const now = new Date();
    const minutes = now.getMinutes();

    if (minutes === 0 || minutes === 30) {
      console.log("Focus Time Started");
      chrome.storage.local.set({ pomodoroStatus: "Focus Time" });
    } else if (minutes === 25) {
      console.log("Break Time Started");
      chrome.storage.local.set({ pomodoroStatus: "Break Time" });

      openBreakPopup();  // Trigger the video popup
    }
  });
}

// ✅ Run Pomodoro check every minute
setInterval(checkPomodoroSchedule, 60 * 1000);

// ✅ Open shuffled video when break starts
function openBreakPopup() {
  chrome.storage.local.get("playlists", (data) => {
    let allVideos = [];

    if (data.playlists && data.playlists.length > 0) {
      // ✅ Use user-added playlists
      allVideos = data.playlists.flatMap(playlist => playlist.videos);
    } else {
      // ✅ Use default playlist when no playlists are added
      allVideos = [
        "sNQaxp0_gkY", "6C5cTQLwzkY", "a8c5wmeOL9o",
        "vUOKwfkbigY", "k83LrLJ1BAs", "Zcp9L_2X51g"
      ]; // Example video IDs from default playlist
    }

    // ✅ Shuffle videos
    const randomVideoId = allVideos[Math.floor(Math.random() * allVideos.length)];

    // ✅ Open popup with shuffled video
    const popup = window.open('', '', 'width=800, height=600');
    popup.document.write(`
      <iframe width="100%" height="100%" 
        src="https://www.youtube.com/embed/${randomVideoId}?autoplay=1" 
        frameborder="0" allow="autoplay; fullscreen" allowfullscreen>
      </iframe>
    `);
  });
}

// ✅ Function to enable/disable Pomodoro
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "togglePomodoro") {
    chrome.storage.local.set({ pomodoroEnabled: message.enabled });
    console.log("Pomodoro Enabled:", message.enabled);
  }
});

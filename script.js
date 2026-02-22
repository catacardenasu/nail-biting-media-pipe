const startCard = document.getElementById("startCard");
const monitorPanel = document.getElementById("monitorPanel");
const startBtn = document.getElementById("startMonitoringBtn");
const stopBtn = document.getElementById("stopMonitoringBtn");
const notificationBtn = document.getElementById("enableNotifications");
const videoElement = document.querySelector(".input_video");
const canvasElement = document.querySelector(".output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const statusText = document.getElementById("status");

let biteStartTime = null;
let notificationsEnabled = false;
let isMonitoring = false;
let camera = null;
let biteAlertActive = false;
let lastNotificationAt = 0;
let reminderIntervalId = null;
let goodSeconds = 0;
let goodTimerInterval = null;
let goalSeconds = 600;
let lastBunnyState = 'idle';



let swRegistration = null;
let soundEnabled = false;
let audioCtx = null;

function playBeep() {
  if (!soundEnabled) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(520, audioCtx.currentTime);
  gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + 0.6);
}

function setBunny(state) {
  if (lastBunnyState === state) return;
  lastBunnyState = state;
  const map = {
    idle: 'gifs/Idle.gif',
    happy: 'gifs/Happy.gif',
    angry: 'gifs/Angry.gif',
    sad: 'gifs/Sad.gif',
    sleepy: 'gifs/Sleepy.gif'
  };
  const src = map[state] + '?t=' + Date.now();
  const monitorBunny = document.getElementById('monitorBunny');
  if (monitorBunny) monitorBunny.src = src;
}

function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return m + ':' + s;
}

function startGoodTimer() {
  if (goodTimerInterval) return;
  goodTimerInterval = setInterval(() => {
    goodSeconds++;
    document.getElementById('goodTimer').textContent = formatTime(goodSeconds);
    const goalStatus = document.getElementById('goalStatus');
    if (goodSeconds >= goalSeconds) {
      goalStatus.textContent = '🎉 Goal reached!';
      setBunny('happy');
    } else {
      const remaining = goalSeconds - goodSeconds;
      goalStatus.textContent = formatTime(remaining) + ' left to reach goal';
      if (goodSeconds > 30) setBunny('happy');
      else setBunny('idle');
    }
  }, 1000);
}

function stopGoodTimer() {
  if (goodTimerInterval) {
    clearInterval(goodTimerInterval);
    goodTimerInterval = null;
  }
}

function resetGoodTimer() {
  stopGoodTimer();
  goodSeconds = 0;
  const goodTimer = document.getElementById('goodTimer');
  if (goodTimer) goodTimer.textContent = '00:00';
  const goalStatus = document.getElementById('goalStatus');
  if (goalStatus) goalStatus.textContent = formatTime(goalSeconds) + ' left to reach goal';
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(reg => { swRegistration = reg; })
    .catch(err => console.error('SW registration failed:', err));
}

const BITE_THRESHOLD_MS = 700;
const DISTANCE_THRESHOLD = 0.08;
const NOTIFICATION_COOLDOWN_MS = 8000;

const holistic = new Holistic({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
});

holistic.setOptions({
  modelComplexity: 1,
  smoothLandmarks: true,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7,
});

holistic.onResults(onResults);

function setStatus(message, state = "normal") {
  statusText.textContent = message;
  statusText.className = `status status-${state}`;
}

function sendNotification() {
  playBeep();
  if (!notificationsEnabled || Notification.permission !== 'granted') return;

  const now = Date.now();
  if (now - lastNotificationAt < NOTIFICATION_COOLDOWN_MS) return;
  lastNotificationAt = now;

  // Use service worker if available (works when tab is hidden)
  if (swRegistration?.active) {
    swRegistration.active.postMessage({ type: 'BITE_ALERT' });
  } else {
    // Fallback for when SW isn't ready yet
    try {
      new Notification('Niblet', {
        body: 'Stop biting your nails! 🐰',
        icon: Math.random() > 0.5 ? 'gifs/Angry.gif' : 'gifs/Sad.gif',
        tag: 'niblet-alert',
        renotify: true,
        requireInteraction: true,
      });
    } catch (e) {
      console.error('Notification failed:', e);
    }
  }
}

function onResults(results) {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  if (results.faceLandmarks) {
    drawConnectors(canvasCtx, results.faceLandmarks, FACEMESH_TESSELATION, {
      color: "#f0c6d7",
      lineWidth: 1,
    });
  }

  if (results.leftHandLandmarks) {
    drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, {
      color: "#ef7b9f",
      lineWidth: 2,
    });
  }

  if (results.rightHandLandmarks) {
    drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, {
      color: "#db5f88",
      lineWidth: 2,
    });
  }

  let handNearMouth = false;

  if (results.faceLandmarks && (results.leftHandLandmarks || results.rightHandLandmarks)) {
    const mouth = results.faceLandmarks[13];
    const hands = [results.leftHandLandmarks, results.rightHandLandmarks];

    hands.forEach((hand) => {
      if (!hand) return;

      [4, 8, 12, 16, 20].forEach((index) => {
        const finger = hand[index];
        const distance = Math.hypot(mouth.x - finger.x, mouth.y - finger.y);
        if (distance < DISTANCE_THRESHOLD) {
          handNearMouth = true;
        }
      });
    });
  }

  if (handNearMouth) {
    if (!biteStartTime) {
      biteStartTime = Date.now();
    } else if (Date.now() - biteStartTime >= BITE_THRESHOLD_MS) {
      biteAlertActive = true;
      const angryOrSad = Math.random() > 0.5 ? 'angry' : 'sad';
      setBunny(angryOrSad);
      setStatus("Stop biting!", "alert");
      sendNotification();
      stopGoodTimer();
      resetGoodTimer();
    }
  } else {
    biteStartTime = null;
    if (biteAlertActive) {
      startGoodTimer();
    }
    biteAlertActive = false;
    setStatus("Monitoring", "normal");
  }

  canvasCtx.restore();
}

async function startMonitoring() {
  if (isMonitoring) return;

  try {
    canvasElement.width = 640;
    canvasElement.height = 480;

    camera = new Camera(videoElement, {
      onFrame: async () => {
        await holistic.send({ image: videoElement });
      },
      width: 640,
      height: 480,
    });

    await camera.start();
    isMonitoring = true;
    biteAlertActive = false;
    lastNotificationAt = 0;

    if (!reminderIntervalId) {
      reminderIntervalId = setInterval(() => {
        if (isMonitoring && biteAlertActive && notificationsEnabled) {
          sendNotification();
        }
      }, 2000);
    }

    startCard.hidden = true;
    monitorPanel.hidden = false;
    requestAnimationFrame(() => monitorPanel.classList.add("active"));
    goalSeconds = (parseInt(document.getElementById('goalInput').value) || 10) * 60;
    resetGoodTimer();
    startGoodTimer();
    setBunny('idle');
    setStatus("Monitoring", "normal");
  } catch (error) {
    setStatus("Could not access webcam. Please allow camera permission.", "alert");
    console.error(error);
  }
}

function stopMonitoring() {
  if (!isMonitoring) return;

  if (camera && typeof camera.stop === "function") {
    camera.stop();
  }

  const stream = videoElement.srcObject;
  if (stream && typeof stream.getTracks === "function") {
    stream.getTracks().forEach((track) => track.stop());
  }

  videoElement.srcObject = null;
  camera = null;
  isMonitoring = false;
  biteStartTime = null;
  biteAlertActive = false;
  lastNotificationAt = 0;

  if (reminderIntervalId) {
    clearInterval(reminderIntervalId);
    reminderIntervalId = null;
  }

  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  monitorPanel.classList.remove("active");
  monitorPanel.hidden = true;
  startCard.hidden = false;
  stopGoodTimer();
  resetGoodTimer();
}

async function toggleNotifications() {
  if (!("Notification" in window)) {
    notificationBtn.textContent = "Notifications Unsupported";
    notificationBtn.disabled = true;
    return;
  }

  if (!window.isSecureContext) {
    notificationBtn.textContent = "Needs HTTPS/localhost";
    notificationBtn.disabled = true;
    setStatus("Notifications require HTTPS or localhost.", "alert");
    return;
  }

  if (Notification.permission === "granted") {
    notificationsEnabled = !notificationsEnabled;
  } else {
    const permission = await Notification.requestPermission();
    notificationsEnabled = permission === "granted";
  }

  notificationBtn.classList.toggle("is-on", notificationsEnabled);
  notificationBtn.setAttribute("aria-pressed", String(notificationsEnabled));
  notificationBtn.textContent = notificationsEnabled
    ? "Notifications Enabled"
    : "Enable Notifications";
}

startBtn.addEventListener("click", startMonitoring);
stopBtn.addEventListener("click", stopMonitoring);
notificationBtn.addEventListener("click", toggleNotifications);

document.addEventListener("visibilitychange", () => {
  if (document.hidden && isMonitoring && biteAlertActive && notificationsEnabled) {
    sendNotification();
  }
});
document.getElementById('pipBtn').addEventListener('click', async () => {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await videoElement.requestPictureInPicture();
    }
  } catch (e) {
    console.error('PiP failed:', e);
    setStatus('Picture-in-Picture not supported in this browser.', 'alert');
  }
});
document.getElementById('enableSound').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById('enableSound');
  btn.classList.toggle('is-on', soundEnabled);
  btn.setAttribute('aria-pressed', String(soundEnabled));
  btn.textContent = soundEnabled ? 'Sound Alert On' : 'Enable Sound Alert';
});

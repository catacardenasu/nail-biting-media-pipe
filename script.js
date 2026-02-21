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
let notificationSent = false;
let notificationsEnabled = false;
let isMonitoring = false;
let camera = null;

const BITE_THRESHOLD_MS = 2500;
const DISTANCE_THRESHOLD = 0.08;

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
  if (!notificationsEnabled || notificationSent) {
    return;
  }

  try {
    new Notification("Niblet Monitor", {
      body: "Stop biting!",
    });
    notificationSent = true;
  } catch (error) {
    console.error("Notification failed:", error);
    setStatus("Notifications blocked in this browser context.", "alert");
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
      setStatus("Stop biting!", "alert");
      sendNotification();
    } else {
      setStatus("Monitoring", "focus");
    }
  } else {
    biteStartTime = null;
    notificationSent = false;
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

    startCard.hidden = true;
    monitorPanel.hidden = false;
    requestAnimationFrame(() => monitorPanel.classList.add("active"));
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
  notificationSent = false;

  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  monitorPanel.classList.remove("active");
  monitorPanel.hidden = true;
  startCard.hidden = false;
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

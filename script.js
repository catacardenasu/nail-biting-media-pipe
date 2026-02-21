const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');
const statusDiv = document.getElementById('status');
const notificationBtn = document.getElementById('enableNotifications');

let biteStartTime = null; 
let notificationSent = false; // Prevents spamming notifications
const BITE_THRESHOLD_MS = 2500; 
const DISTANCE_THRESHOLD = 0.08;

// Request Permission
notificationBtn.onclick = () => {
  Notification.requestPermission().then(permission => {
    if (permission === "granted") {
      notificationBtn.style.display = "none";
      alert("Notifications enabled!");
    }
  });
};

function sendNotification() {
  // Only send if the tab is hidden and we haven't sent one for this "bite" yet
  if (document.hidden && Notification.permission === "granted" && !notificationSent) {
    new Notification("Nail Biting Detected!", {
      body: "Get your hands away from your mouth!",
      icon: "https://cdn-icons-png.flaticon.com/512/595/595067.png" // Optional icon
    });
    notificationSent = true; 
  }
}

function onResults(results) {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  if (results.faceLandmarks) {
    drawConnectors(canvasCtx, results.faceLandmarks, FACEMESH_TESSELATION, {color: '#C0C0C070', lineWidth: 1});
  }
  if (results.leftHandLandmarks) {
    drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, {color: '#CC0000', lineWidth: 2});
  }
  if (results.rightHandLandmarks) {
    drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, {color: '#00CC00', lineWidth: 2});
  }

  let handCurrentlyNearMouth = false;

  if (results.faceLandmarks && (results.leftHandLandmarks || results.rightHandLandmarks)) {
    const mouth = results.faceLandmarks[13]; 
    const hands = [results.leftHandLandmarks, results.rightHandLandmarks];
    
    hands.forEach(hand => {
      if (hand) {
        [4, 8, 12, 16, 20].forEach(index => {
          const finger = hand[index];
          const dist = Math.hypot(mouth.x - finger.x, mouth.y - finger.y);
          if (dist < DISTANCE_THRESHOLD) handCurrentlyNearMouth = true;
        });
      }
    });
  }

  if (handCurrentlyNearMouth) {
    if (!biteStartTime) {
      biteStartTime = Date.now();
    } else {
      const duration = Date.now() - biteStartTime;
      if (duration >= BITE_THRESHOLD_MS) {
        statusDiv.innerText = "🚨 STOP BITING! 🚨";
        statusDiv.className = "warning";
        sendNotification(); // Triggered here
      } else {
        statusDiv.innerText = `Focusing...`;
      }
    }
  } else {
    biteStartTime = null;
    notificationSent = false; // Reset so it can fire again next time
    statusDiv.innerText = "Status: Working Good ✅";
    statusDiv.className = "";
  }
  canvasCtx.restore();
}

// --- MediaPipe Setup ---
const holistic = new Holistic({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
}});

holistic.setOptions({
  modelComplexity: 2,
  smoothLandmarks: true, // Helps prevent "flickering"
  minDetectionConfidence: 0.7, // Higher means it must be more sure it sees a hand
  minTrackingConfidence: 0.7
});

holistic.onResults(onResults);

const camera = new Camera(videoElement, {
  onFrame: async () => {
    await holistic.send({image: videoElement});
  },
  width: 640,
  height: 480
});
camera.start();
/* ================== AUDIO SOURCES ================== */
const soundBank = {
  tap: new Audio("assets/sounds/tap.mp3"),
  drop: new Audio("assets/sounds/drop.mp3"),
  bell: new Audio("assets/sounds/bell.mp3"),
  breath: new Audio("assets/sounds/breath.mp3"),
  ui: new Audio("assets/sounds/ui-click.mp3"),
  shimmer: new Audio("assets/sounds/gold-shimmer.mp3")
};

// Base volumes for UI sounds
soundBank.ui.volume = 0.45;
soundBank.shimmer.volume = 0.35;

// Master volume (controlled by slider)
let masterVolume = 1;

/* ================== DOM REFS ================== */
const pads         = document.querySelectorAll(".pad");
const volumeSlider = document.getElementById("volume");
const muteBtn      = document.getElementById("mute");
const recordBtn    = document.getElementById("record");
const playBtn      = document.getElementById("playRecord");
const saveBtn      = document.getElementById("saveRec");
const themeToggle  = document.getElementById("themeToggle");

const muteLabel = muteBtn.querySelector(".btn-label");
const muteIcon  = muteBtn.querySelector(".btn-icon");
const recordLabel = recordBtn.querySelector(".btn-label");
const recordIcon  = recordBtn.querySelector(".btn-icon");
const playLabel   = playBtn.querySelector(".btn-label");
const playIcon    = playBtn.querySelector(".btn-icon");

let isMuted       = false;
let isRecording   = false;
let sequence      = []; // saves sounds during record
let isPlayingLoop = false;
let playLoopTimer = null;

/* ================== AUDIO CONTEXT + MASTER GAIN + UNLOCK ================== */
const AC = window.AudioContext || window.webkitAudioContext;
let audioCtx = new AC();

// shared master gain node for all Web Audio sounds
const masterGainNode = audioCtx.createGain();
masterGainNode.gain.value = masterVolume;
masterGainNode.connect(audioCtx.destination);

// ensure context is resumed on first interaction (required by browsers)[web:16]
function resumeAudioCtx() {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}
document.addEventListener("click", resumeAudioCtx);
document.addEventListener("keydown", resumeAudioCtx);
document.addEventListener("touchstart", resumeAudioCtx);

/* Impulse generator for subtle echo & reverb */
function createImpulse(duration, decay) {
  const rate   = audioCtx.sampleRate;
  const len    = rate * duration;
  const impulse = audioCtx.createBuffer(1, len, rate);
  const data    = impulse.getChannelData(0);

  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return impulse;
}

/* FX profiles */
function bellFX() {
  const dry = audioCtx.createGain();
  const wet = audioCtx.createGain();
  const convolver = audioCtx.createConvolver();
  convolver.buffer = createImpulse(1.2, 2.4);
  wet.gain.value = 0.42;
  dry.gain.value = 0.86;
  return { dry, wet, convolver };
}

function dropFX() {
  const delay = audioCtx.createDelay();
  const feedback = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  delay.delayTime.value = 0.18;
  feedback.gain.value = 0.38;
  filter.type = "lowpass";
  filter.frequency.value = 1600;

  // Feedback loop
  delay.connect(feedback);
  feedback.connect(filter);
  filter.connect(delay);

  return { delay, feedback, filter };
}

function windFX() {
  const stereo = audioCtx.createStereoPanner();
  stereo.pan.value = 0.22;
  return { stereo };
}

function bambooFX() {
  const eq = audioCtx.createBiquadFilter();
  eq.type = "lowshelf";
  eq.frequency.value = 260;
  eq.gain.value = 3.0;
  return { eq };
}

/* ================== MUTE BUTTON UI ================== */
function updateMuteUI() {
  if (isMuted) {
    muteLabel.textContent = "Muted";
    muteIcon.textContent  = "🔇";
  } else {
    muteLabel.textContent = "Mute";
    muteIcon.textContent  = "🔊";
  }
}
updateMuteUI();

/* ================== MAIN PLAY FUNCTION ================== */
function playPad(name) {
  const pad = document.querySelector(`.pad[data-sound="${name}"]`);

  // shimmer + spark always play
  playShimmer();
  if (pad) sparkAtPad(pad);

  const audio = soundBank[name];
  if (!audio) return;

  // Ensure HTMLAudio has correct volume for fallback[web:2][web:26]
  audio.volume = masterVolume;
  audio.muted  = isMuted;

  // Create buffer source for Web Audio chain
  const node = audioCtx.createBufferSource();

  fetch(audio.src)
    .then(r => r.arrayBuffer())
    .then(b => audioCtx.decodeAudioData(b))
    .then(buf => {
      node.buffer = buf;

      // use shared masterGainNode for volume + mute[web:6][web:23]
      let output = masterGainNode;

      if (name === "bell") {
        const { dry, wet, convolver } = bellFX();
        node.connect(dry);
        dry.connect(output);
        node.connect(convolver);
        convolver.connect(wet);
        wet.connect(output);
      } else if (name === "drop") {
        const { delay, feedback, filter } = dropFX();
        node.connect(delay);
        delay.connect(output);
        delay.connect(feedback);
        filter.connect(output);
      } else if (name === "breath") {
        const { stereo } = windFX();
        node.connect(stereo);
        stereo.connect(output);
      } else if (name === "tap") {
        const { eq } = bambooFX();
        node.connect(eq);
        eq.connect(output);
      } else {
        node.connect(output);
      }

      node.start();
    })
    .catch(err => {
      // If fetch fails (e.g. opened via file://), fallback to normal HTMLAudio playback.
      console.error("Falling back to HTMLAudio playback:", err);
      audio.currentTime = 0;
      audio.play();
    });

  // recording
  if (isRecording) sequence.push(name);

  // strike animation
  if (pad) {
    pad.classList.add("active");
    setTimeout(() => pad.classList.remove("active"), 220);
  }
}

/* ================== UI CLICK FX ================== */
function uiClick() {
  const click = soundBank.ui;
  click.muted  = isMuted;
  click.volume = 0.45 * masterVolume;
  click.currentTime = 0;
  click.play();
}

/* ================== SHIMMER & SPARK ================== */
function playShimmer() {
  const s = soundBank.shimmer;
  s.muted  = isMuted;
  s.volume = 0.35 * masterVolume;
  s.currentTime = 0;
  s.play();
}

/* Visual burst */
function sparkAtPad(pad) {
  const rect = pad.getBoundingClientRect();
  const spark = document.createElement("div");
  spark.className = "spark";
  spark.style.left = rect.left + rect.width / 2 + "px";
  spark.style.top  = rect.top  + rect.height / 2 + "px";
  document.body.appendChild(spark);
  setTimeout(() => spark.remove(), 450);
}

/* ================== BUTTON EVENTS ================== */
pads.forEach(p => p.addEventListener("click", () => playPad(p.dataset.sound)));

document.addEventListener("keydown", e => {
  const key = e.key.toUpperCase();
  const pad = document.querySelector(`.pad[data-key="${key}"]`);
  if (pad) playPad(pad.dataset.sound);
});

// Volume slider: update masterVolume and masterGainNode
volumeSlider.addEventListener("input", () => {
  masterVolume = parseFloat(volumeSlider.value);
  if (!isMuted) {
    masterGainNode.gain.value = masterVolume;
  }
});

// Mute button: affect both HTMLAudio and Web Audio master gain
muteBtn.addEventListener("click", () => {
  isMuted = !isMuted;

  // Mute HTMLAudio-based sounds as well
  Object.entries(soundBank).forEach(([name, audio]) => {
    if (name !== "ui") audio.muted = isMuted;
  });

  // Web Audio master gain
  masterGainNode.gain.value = isMuted ? 0 : masterVolume;

  updateMuteUI();
  uiClick();
});

// Record toggle (clear sequence only when starting record)
recordBtn.addEventListener("click", () => {
  isRecording = !isRecording;
  if (isRecording) {
    sequence = [];
    recordLabel.textContent = "Recording";
  } else {
    recordLabel.textContent = "Record";
  }
  uiClick();
});

// Play button: toggle Play / Stop looping the sequence
playBtn.addEventListener("click", () => {
  uiClick();

  if (!sequence.length) {
    alert("No sequence recorded. Press Record, play pads, then Play.");
    return;
  }

  // stop if already playing
  if (isPlayingLoop) {
    isPlayingLoop = false;
    if (playLoopTimer) clearInterval(playLoopTimer);
    playLoopTimer = null;
    playIcon.textContent = "▶️";
    playLabel.textContent = "Play";
    return;
  }

  // start loop
  isPlayingLoop = true;
  playIcon.textContent = "⏸️";
  playLabel.textContent = "Stop";

  const step = 350; // ms between hits
  let index = 0;

  playLoopTimer = setInterval(() => {
    if (!isPlayingLoop) return;
    const name = sequence[index];
    if (name) playPad(name);
    index = (index + 1) % sequence.length;
  }, step);
});

themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("light");
  document.body.classList.toggle("dark");
  uiClick();
});

/* ================== SAVE RECORDING (WAV + REVERB) ================== */
let renderBuffers = {};
let renderLoaded  = false;

async function ensureRenderBuffers() {
  if (renderLoaded) return;
  const AC2 = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC2();

  async function loadBuffer(url) {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    return await ctx.decodeAudioData(arr);
  }

  renderBuffers.tap    = await loadBuffer("assets/sounds/tap.mp3");
  renderBuffers.drop   = await loadBuffer("assets/sounds/drop.mp3");
  renderBuffers.bell   = await loadBuffer("assets/sounds/bell.mp3");
  renderBuffers.breath = await loadBuffer("assets/sounds/breath.mp3");

  renderLoaded = true;
  ctx.close();
}

function bufferToWave(audioBuffer) {
  const numChannels    = audioBuffer.numberOfChannels;
  const sampleRate     = audioBuffer.sampleRate;
  const samples        = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign     = numChannels * bytesPerSample;

  const buffer = new ArrayBuffer(44 + samples * bytesPerSample * numChannels);
  const view   = new DataView(buffer);
  let offset   = 0;

  function writeString(s) {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset++, s.charCodeAt(i));
    }
  }

  writeString("RIFF");
  view.setUint32(offset, 36 + samples * bytesPerSample * numChannels, true); offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true);  offset += 2;
  view.setUint16(offset, numChannels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;

  writeString("data");
  view.setUint32(offset, samples * bytesPerSample * numChannels, true); offset += 4;

  const channelData = [];
  for (let c = 0; c < numChannels; c++) {
    channelData[c] = audioBuffer.getChannelData(c);
  }

  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channelData[c][i];
      sample = Math.max(-1, Math.min(1, sample));
      const s = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, s, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

// Export
async function exportRecording() {
  if (!sequence.length) {
    alert("No recording to save. Press Record, play something, then Save Rec.");
    return;
  }

  await ensureRenderBuffers();

  const OfflineAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const stepSec   = 0.35;
  const duration  = sequence.length * stepSec + 2;
  const sampleRate = 44100;
  const frames     = Math.ceil(duration * sampleRate);

  const offlineCtx = new OfflineAC(1, frames, sampleRate);
  const convolver  = offlineCtx.createConvolver();
  convolver.buffer = createImpulse(2.3, 2.6);
  convolver.connect(offlineCtx.destination);

  sequence.forEach((name, index) => {
    const buf = renderBuffers[name];
    if (!buf) return;
    const src = offlineCtx.createBufferSource();
    src.buffer = buf;
    src.connect(convolver);
    src.start(index * stepSec);
  });

  const rendered = await offlineCtx.startRendering();
  const wavBlob  = bufferToWave(rendered);
  const url      = URL.createObjectURL(wavBlob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "thapitalu_recording.wav";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

saveBtn.addEventListener("click", () => {
  uiClick();
  exportRecording().catch(console.error);
});

/* ================== PETALS ================== */
const petalsCanvas = document.getElementById("petals");
const petalsCtx    = petalsCanvas.getContext("2d");
let petals = [];
const maxPetals = 14;

function resizePetals() {
  petalsCanvas.width  = window.innerWidth;
  petalsCanvas.height = window.innerHeight;
}
resizePetals();
window.addEventListener("resize", resizePetals);

class Petal {
  constructor() { this.reset(); }
  reset() {
    this.x = Math.random() * petalsCanvas.width;
    this.y = Math.random() * petalsCanvas.height;
    this.size = Math.random() * 10 + 6;
    this.opacity = Math.random() * 0.4 + 0.2;
    this.speedX = Math.random() * 0.4 + 0.1;
    this.speedY = Math.random() * 0.25 + 0.05;
    this.angle  = Math.random() * 360;
  }
  draw() {
    petalsCtx.save();
    petalsCtx.globalAlpha = this.opacity;
    petalsCtx.translate(this.x, this.y);
    petalsCtx.rotate((this.angle * Math.PI) / 180);
    petalsCtx.beginPath();
    petalsCtx.moveTo(0, 0);
    petalsCtx.quadraticCurveTo(this.size, -this.size, this.size * 2, 0);
    petalsCtx.quadraticCurveTo(this.size, this.size, 0, 0);
    petalsCtx.fillStyle = "#ffb7c5";
    petalsCtx.fill();
    petalsCtx.restore();
  }
  update(mx, my) {
    this.x += this.speedX + (mx - petalsCanvas.width / 2) * 0.00002;
    this.y += this.speedY + (my - petalsCanvas.height / 2) * 0.000015;
    this.angle += 0.15;
    if (this.x > petalsCanvas.width + 20 || this.y > petalsCanvas.height + 20) {
      this.reset(); this.y = -10;
    }
  }
}

for (let i = 0; i < maxPetals; i++) petals.push(new Petal());

let mouse = { x: petalsCanvas.width / 2, y: petalsCanvas.height / 2 };
document.addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });

function animatePetals() {
  petalsCtx.clearRect(0, 0, petalsCanvas.width, petalsCanvas.height);
  petals.forEach(p => { p.update(mouse.x, mouse.y); p.draw(); });
  requestAnimationFrame(animatePetals);
}
animatePetals();

/* ================== SMOKE ================== */
const smokeCanvas = document.getElementById("smoke");
const smokeCtx    = smokeCanvas.getContext("2d");

function resizeSmoke() {
  smokeCanvas.width  = window.innerWidth;
  smokeCanvas.height = window.innerHeight;
}
resizeSmoke();
window.addEventListener("resize", resizeSmoke);

let t = 0;
function drawSmoke() {
  smokeCtx.clearRect(0, 0, smokeCanvas.width, smokeCanvas.height);
  const w = smokeCanvas.width;
  const h = smokeCanvas.height;

  smokeCtx.save();
  smokeCtx.translate(w * 0.15, h * 0.9);
  smokeCtx.strokeStyle = "rgba(255,255,255,0.08)";
  smokeCtx.lineWidth = 2;

  for (let i = 0; i < 3; i++) {
    smokeCtx.beginPath();
    let x = 0, y = 0;
    smokeCtx.moveTo(x, y);
    for (let j = 0; j < 40; j++) {
      x += (Math.sin((t + i * 20 + j * 8) * 0.01) * 4);
      y -= h / 80;
      smokeCtx.lineTo(x, y);
    }
    smokeCtx.stroke();
  }

  smokeCtx.restore();
  t += 1;
  requestAnimationFrame(drawSmoke);
}
drawSmoke();

(() => {
  const CLIP_SECONDS = 5;
  const PLAYBACK_SAMPLE_RATE = 44100;
  const FIXED_SEED_PREFIX = "time2:";
  const LEGACY_FIXED_SEED_PREFIX = "bob2:";
  const FIXED_SEED_BYTES = 18000;
  const FIXED_AUDIO_SAMPLE_COUNT = (FIXED_SEED_BYTES - 1) * 2;
  const UPLOAD_SAMPLE_RATE = 8000;
  const UPLOAD_SAMPLE_COUNT = CLIP_SECONDS * UPLOAD_SAMPLE_RATE;
  const UPLOAD_BYTE_COUNT = Math.ceil(UPLOAD_SAMPLE_COUNT / 2);
  const UPLOAD_PREFIX = "bob1:";
  const MU = 32;

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

  const refs = {
    previous: document.querySelector("#previous"),
    playPause: document.querySelector("#playPause"),
    next: document.querySelector("#next"),
    status: document.querySelector("#status"),
    seed: document.querySelector("#seed"),
    goSeed: document.querySelector("#goSeed"),
    copySeed: document.querySelector("#copySeed"),
    file: document.querySelector("#file"),
    record: document.querySelector("#record"),
    recordIndicator: document.querySelector("#recordIndicator"),
    start: document.querySelector("#start"),
    length: document.querySelector("#length"),
    startLabel: document.querySelector("#startLabel"),
    lengthLabel: document.querySelector("#lengthLabel"),
    preview: document.querySelector("#preview"),
    encode: document.querySelector("#encode"),
  };

  function internalTimestamp(displayTimestamp) {
    const timestamp = displayTimestamp.trim();

    if (
      timestamp.startsWith(FIXED_SEED_PREFIX) ||
      timestamp.startsWith(LEGACY_FIXED_SEED_PREFIX) ||
      timestamp.startsWith(UPLOAD_PREFIX) ||
      timestamp.startsWith("bobfile1:")
    ) {
      return timestamp;
    }

    return FIXED_SEED_PREFIX + timestamp;
  }

  function displayTimestamp(internal) {
    if (internal.startsWith(FIXED_SEED_PREFIX)) {
      return internal.slice(FIXED_SEED_PREFIX.length);
    }

    return internal;
  }

  const state = {
    audioContext: null,
    source: null,
    fileAudio: null,
    fileTimer: null,
    fileUrl: null,
    previewSource: null,
    previewAudio: null,
    previewTimer: null,
    buffer: null,
    fileClip: null,
    offset: 0,
    startedAt: 0,
    playing: false,
    busy: false,
    recording: false,
    recordedClip: null,
    uploadFile: null,
    uploadBytes: null,
    uploadMime: "",
    uploadUrl: null,
    uploadDuration: 0,
    history: [],
    historyIndex: -1,
  };

  function setStatus(message) {
    refs.status.textContent = message;
  }

  function setBusy(isBusy, message) {
    state.busy = isBusy;
    if (message) setStatus(message);
    updateButtons();
  }

  function updateButtons() {
    const hasSeed = refs.seed.value.trim().length > 0;
    const hasUpload = hasUploadSource();

    refs.previous.disabled = state.busy || state.historyIndex <= 0;
    refs.playPause.disabled = state.busy;
    refs.playPause.textContent = state.playing ? "❚❚" : "▶";
    refs.playPause.setAttribute("aria-label", state.playing ? "pause" : "play");
    refs.next.disabled = state.busy;
    refs.goSeed.disabled = state.busy || !hasSeed;
    refs.copySeed.disabled = state.busy || !hasSeed;
    refs.record.disabled = state.busy || state.recording || !canRecordAudio();
    refs.record.textContent = state.recording ? "recording" : "record 5s";
    refs.recordIndicator.textContent = state.recording ? "recording" : "";
    refs.recordIndicator.classList.toggle("active", state.recording);
    refs.preview.disabled = state.busy || !hasUpload;
    refs.encode.disabled = state.busy || !hasUpload;
  }

  function hasUploadSource() {
    return Boolean(state.uploadBytes || state.recordedClip);
  }

  function createAudioBuffer(seconds, sampleRate = PLAYBACK_SAMPLE_RATE) {
    const length = Math.round(seconds * sampleRate);

    try {
      return new AudioBuffer({
        length,
        numberOfChannels: 1,
        sampleRate,
      });
    } catch {
      return getAudioContext().createBuffer(1, length, sampleRate);
    }
  }

  function getAudioContext() {
    if (!AudioContextCtor) {
      throw new Error("Web Audio is not supported in this browser.");
    }

    if (!state.audioContext) {
      state.audioContext = new AudioContextCtor();
    }

    return state.audioContext;
  }

  async function resumeAudioContext() {
    const context = getAudioContext();

    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {}
    }

    return context;
  }

  function bytesToBase64Url(bytes) {
    let binary = "";
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlToBytes(text) {
    let normalized = text.trim().replace(/\s+/g, "");
    normalized = normalized.replace(/-/g, "+").replace(/_/g, "/");
    normalized += "=".repeat((4 - normalized.length % 4) % 4);

    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  function textToBase64Url(text) {
    return bytesToBase64Url(new TextEncoder().encode(text));
  }

  function base64UrlToText(text) {
    return new TextDecoder().decode(base64UrlToBytes(text));
  }

  function randomSeed() {
    const bytes = new Uint8Array(FIXED_SEED_BYTES);
    crypto.getRandomValues(bytes);
    bytes[0] = 0;
    return FIXED_SEED_PREFIX + bytesToBase64Url(bytes);
  }

  function hashSeed(seed) {
    let h1 = 1779033703;
    let h2 = 3144134277;
    let h3 = 1013904242;
    let h4 = 2773480762;

    for (let i = 0; i < seed.length; i++) {
      const k = seed.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }

    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

    return [
      (h1 ^ h2 ^ h3 ^ h4) >>> 0,
      (h2 ^ h1) >>> 0,
      (h3 ^ h1) >>> 0,
      (h4 ^ h1) >>> 0,
    ];
  }

  function makeRandom(seed) {
    let [a, b, c, d] = hashSeed(seed);

    return function random() {
      a >>>= 0;
      b >>>= 0;
      c >>>= 0;
      d >>>= 0;

      const t = (a + b | 0) + d | 0;
      d = d + 1 | 0;
      a = b ^ b >>> 9;
      b = c + (c << 3) | 0;
      c = c << 21 | c >>> 11;
      c = c + t | 0;

      return (t >>> 0) / 4294967296;
    };
  }

  function makeProceduralBuffer(seed) {
    const buffer = createAudioBuffer(CLIP_SECONDS);
    const data = buffer.getChannelData(0);
    const random = makeRandom(seed);
    const tau = Math.PI * 2;
    const toneCount = 8 + Math.floor(random() * 18);
    const eventCount = 10 + Math.floor(random() * 22);
    const tones = [];
    const events = [];
    const fadeFrames = Math.floor(0.035 * buffer.sampleRate);

    for (let i = 0; i < toneCount; i++) {
      tones.push({
        frequency: 24 + random() * 3600,
        phase: random() * tau,
        amplitude: 0.008 + random() * 0.075,
        wobble: random() * 70,
        lfo: 0.015 + random() * 1.1,
        pulse: 0.04 + random() * 1.8,
      });
    }

    for (let i = 0; i < eventCount; i++) {
      events.push({
        center: random() * CLIP_SECONDS,
        width: 0.04 + random() * 0.7,
        frequency: 45 + random() * 5000,
        phase: random() * tau,
        amplitude: 0.04 + random() * 0.2,
        bend: (random() * 2 - 1) * 300,
      });
    }

    let lowpass = 0;
    let band = 0;
    let last = 0;
    const noiseMix = 0.2 + random() * 0.55;

    for (let i = 0; i < data.length; i++) {
      const t = i / buffer.sampleRate;
      const white = random() * 2 - 1;
      lowpass = lowpass * 0.984 + white * 0.016;
      band = band * 0.82 + (white - lowpass) * 0.18;

      let sample = lowpass * noiseMix + band * 0.16;
      for (const tone of tones) {
        const frequency = tone.frequency + tone.wobble * Math.sin(tau * tone.lfo * t);
        const gate = 0.45 + 0.55 * Math.sin(tau * tone.pulse * t + tone.phase * 0.17);
        tone.phase += tau * frequency / buffer.sampleRate;
        sample += tone.amplitude * gate * Math.sin(tone.phase);
      }

      for (const event of events) {
        const distance = Math.abs(t - event.center);
        if (distance < event.width) {
          const envelope = 0.5 + 0.5 * Math.cos(Math.PI * distance / event.width);
          const frequency = Math.max(20, event.frequency + event.bend * (t - event.center));
          event.phase += tau * frequency / buffer.sampleRate;
          sample += event.amplitude * envelope * Math.sin(event.phase);
        }
      }

      sample = Math.tanh(sample * 1.6);
      sample = sample * 0.86 + last * 0.14;
      last = sample;

      const fadeIn = i < fadeFrames ? i / fadeFrames : 1;
      const fadeOut = i > data.length - fadeFrames ? (data.length - i) / fadeFrames : 1;
      data[i] = sample * Math.max(0, Math.min(fadeIn, fadeOut)) * 0.74;
    }

    return buffer;
  }

  function encodeNibble(sample) {
    const clipped = Math.max(-1, Math.min(1, sample));
    const sign = clipped < 0 ? 8 : 0;
    const magnitude = Math.round(
      Math.log1p(Math.abs(clipped) * MU) / Math.log1p(MU) * 7
    );

    return sign | Math.max(0, Math.min(7, magnitude));
  }

  function decodeNibble(code) {
    const magnitude = code & 7;
    const sign = code & 8 ? -1 : 1;
    const expanded = (Math.exp(magnitude / 7 * Math.log1p(MU)) - 1) / MU;

    return sign * expanded;
  }

  function decodeUploadSeed(seed) {
    if (!seed.startsWith(UPLOAD_PREFIX)) return null;

    try {
      const bytes = base64UrlToBytes(seed.slice(UPLOAD_PREFIX.length));
      if (bytes.length !== UPLOAD_BYTE_COUNT) return null;

      const lowFi = new Float32Array(UPLOAD_SAMPLE_COUNT);
      for (let i = 0; i < UPLOAD_SAMPLE_COUNT; i++) {
        const byte = bytes[i >> 1];
        const code = i % 2 === 0 ? byte >> 4 : byte & 15;
        lowFi[i] = decodeNibble(code);
      }

      const buffer = createAudioBuffer(CLIP_SECONDS);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < data.length; i++) {
        const position = i * UPLOAD_SAMPLE_RATE / buffer.sampleRate;
        const left = Math.floor(position);
        const right = Math.min(left + 1, lowFi.length - 1);
        const mix = position - left;
        data[i] = lowFi[left] + (lowFi[right] - lowFi[left]) * mix;
      }

      return buffer;
    } catch {
      return null;
    }
  }

  function makeBufferFromFixedAudioBytes(bytes) {
    const lowFi = new Float32Array(FIXED_AUDIO_SAMPLE_COUNT);

    for (let i = 0; i < FIXED_AUDIO_SAMPLE_COUNT; i++) {
      const byte = bytes[1 + (i >> 1)];
      const code = i % 2 === 0 ? byte >> 4 : byte & 15;
      lowFi[i] = decodeNibble(code);
    }

    const buffer = createAudioBuffer(CLIP_SECONDS);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const position = i * (lowFi.length - 1) / Math.max(1, data.length - 1);
      const left = Math.floor(position);
      const right = Math.min(left + 1, lowFi.length - 1);
      const mix = position - left;
      data[i] = lowFi[left] + (lowFi[right] - lowFi[left]) * mix;
    }

    return buffer;
  }

  function decodeFixedSeed(seed) {
    const prefix = seed.startsWith(FIXED_SEED_PREFIX)
      ? FIXED_SEED_PREFIX
      : (seed.startsWith(LEGACY_FIXED_SEED_PREFIX) ? LEGACY_FIXED_SEED_PREFIX : "");

    if (!prefix) return null;

    try {
      const bytes = base64UrlToBytes(seed.slice(prefix.length));
      if (bytes.length !== FIXED_SEED_BYTES) return null;

      if (bytes[0] === 1) {
        return { type: "buffer", buffer: makeBufferFromFixedAudioBytes(bytes) };
      }

      return { type: "buffer", buffer: makeProceduralBuffer(seed) };
    } catch {
      return null;
    }
  }

  function decodeFileSeed(seed) {
    if (!seed.startsWith("bobfile1:")) return null;

    try {
      const parts = seed.split(":");
      if (parts.length !== 5) return null;

      const start = Number(parts[1]) / 1000;
      const length = Number(parts[2]) / 1000;
      const mime = base64UrlToText(parts[3]) || "audio/mpeg";
      const bytes = base64UrlToBytes(parts[4]);

      if (!Number.isFinite(start) || !Number.isFinite(length) || !bytes.length) {
        return null;
      }

      return {
        type: "file",
        bytes,
        mime,
        start: Math.max(0, start),
        length: Math.max(0.01, Math.min(CLIP_SECONDS, length)),
      };
    } catch {
      return null;
    }
  }

  function playableFromSeed(seed) {
    const fixedSeed = decodeFixedSeed(seed);
    if (fixedSeed) return fixedSeed;

    const fileClip = decodeFileSeed(seed);
    if (fileClip) return fileClip;

    const uploadBuffer = decodeUploadSeed(seed);
    if (uploadBuffer) return { type: "buffer", buffer: uploadBuffer };

    return { type: "buffer", buffer: makeProceduralBuffer(seed) };
  }

  function stopSource() {
    if (state.source) {
      state.source.onended = null;
      try {
        state.source.stop();
      } catch {}
      try {
        state.source.disconnect();
      } catch {}

      state.source = null;
    }

    if (state.fileTimer) {
      window.clearInterval(state.fileTimer);
      state.fileTimer = null;
    }

    if (state.fileAudio) {
      state.fileAudio.onended = null;
      state.fileAudio.onerror = null;
      state.fileAudio.onloadedmetadata = null;
      state.fileAudio.pause();
      state.fileAudio.removeAttribute("src");
      state.fileAudio.load();
      state.fileAudio = null;
    }

    if (state.fileUrl) {
      URL.revokeObjectURL(state.fileUrl);
      state.fileUrl = null;
    }
  }

  function stopPreview() {
    if (state.previewSource) {
      state.previewSource.onended = null;
      try {
        state.previewSource.stop();
      } catch {}
      try {
        state.previewSource.disconnect();
      } catch {}

      state.previewSource = null;
    }

    if (state.previewTimer) {
      window.clearInterval(state.previewTimer);
      state.previewTimer = null;
    }

    if (state.previewAudio) {
      state.previewAudio.onended = null;
      state.previewAudio.onerror = null;
      state.previewAudio.onloadedmetadata = null;
      state.previewAudio.pause();
      state.previewAudio.removeAttribute("src");
      state.previewAudio.load();
      state.previewAudio = null;
    }
  }

  function pushHistory(seed) {
    if (state.history[state.historyIndex] === seed) return;

    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(seed);
    state.historyIndex = state.history.length - 1;
  }

  async function loadSeed(seed, options = {}) {
    const normalized = seed.trim() || randomSeed();
    const playable = playableFromSeed(normalized);

    stopSource();
    state.buffer = playable.type === "buffer" ? playable.buffer : null;
    state.fileClip = playable.type === "file" ? playable : null;
    state.offset = 0;
    state.playing = false;
    refs.seed.value = displayTimestamp(normalized);

    if (options.addHistory) {
      pushHistory(normalized);
    }

    updateButtons();

    if (options.autoPlay) {
      await playCurrent();
    } else {
      setStatus(options.status || "");
    }
  }

  async function playCurrent() {
    if (!state.buffer && !state.fileClip) {
      await loadSeed(randomSeed(), { addHistory: true, autoPlay: true });
      return;
    }

    if (state.fileClip) {
      await playFileClip();
      return;
    }

    const context = await resumeAudioContext();
    if (context.state !== "running") {
      state.playing = false;
      stopSource();
      setStatus("press play");
      updateButtons();
      return;
    }

    stopPreview();
    stopSource();

    if (state.offset >= state.buffer.duration - 0.02) {
      state.offset = 0;
    }

    const source = context.createBufferSource();
    source.buffer = state.buffer;
    source.connect(context.destination);
    source.onended = () => {
      if (state.source !== source) return;
      state.source = null;
      state.playing = false;
      state.offset = 0;
      updateButtons();
      nextSeed(true);
    };

    state.source = source;
    state.startedAt = context.currentTime - state.offset;
    state.playing = true;
    source.start(0, state.offset);
    setStatus("");
    updateButtons();
  }

  function playFileClip() {
    return new Promise((resolve, reject) => {
      const clip = state.fileClip;
      if (!clip) {
        resolve();
        return;
      }

      stopPreview();
      stopSource();

      const blob = new Blob([clip.bytes], { type: clip.mime });
      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      const start = clip.start + state.offset;
      const end = clip.start + Math.max(0.01, clip.length);

      state.fileUrl = url;
      state.fileAudio = audio;
      audio.preload = "auto";
      audio.playsInline = true;

      function finish() {
        if (state.fileAudio !== audio) return;
        state.offset = 0;
        state.playing = false;
        stopSource();
        updateButtons();
        nextSeed(true);
      }

      function beginPlayback() {
        try {
          audio.currentTime = Math.min(start, Math.max(0, audio.duration - 0.01));
        } catch {}

        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise
            .then(() => {
              state.startedAt = audio.currentTime - state.offset;
              state.playing = true;
              state.fileTimer = window.setInterval(() => {
                if (state.fileAudio !== audio) return;
                state.offset = Math.max(0, audio.currentTime - clip.start);
                if (audio.currentTime >= end || audio.ended) {
                  finish();
                }
              }, 40);
              setStatus("");
              updateButtons();
              resolve();
            })
            .catch((error) => {
              stopSource();
              setStatus("press play");
              updateButtons();
              reject(error);
            });
        } else {
          state.playing = true;
          setStatus("");
          updateButtons();
          resolve();
        }
      }

      audio.onloadedmetadata = beginPlayback;
      audio.onended = finish;
      audio.onerror = () => {
        stopSource();
        reject(new Error("could not play uploaded timestamp"));
      };
      audio.src = url;
      audio.load();
    });
  }

  function pauseCurrent(message = "") {
    if (!state.playing) return;

    if (state.fileAudio && state.fileClip) {
      state.offset = Math.max(0, state.fileAudio.currentTime - state.fileClip.start);
      state.playing = false;
      stopSource();
      if (message) setStatus(message);
      updateButtons();
      return;
    }

    if (!state.audioContext || !state.buffer) return;

    state.offset = Math.max(
      0,
      Math.min(state.buffer.duration, state.audioContext.currentTime - state.startedAt)
    );
    state.playing = false;
    stopSource();
    if (message) setStatus(message);
    updateButtons();
  }

  async function nextSeed(autoPlay = true) {
    if (state.busy) return;

    setBusy(true);
    try {
      pauseCurrent(null);
      await loadSeed(randomSeed(), { addHistory: true, autoPlay });
    } catch (error) {
      console.error(error);
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function previousSeed() {
    if (state.busy || state.historyIndex <= 0) return;

    setBusy(true);
    try {
      pauseCurrent(null);
      state.historyIndex -= 1;
      await loadSeed(state.history[state.historyIndex], { addHistory: false, autoPlay: true });
    } catch (error) {
      console.error(error);
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePlay() {
    if (state.busy) return;

    if (state.playing) {
      pauseCurrent();
      return;
    }

    try {
      await playCurrent();
    } catch (error) {
      console.error(error);
      setStatus(error.message);
      updateButtons();
    }
  }

  async function goToSeed() {
    if (state.busy) return;

    setBusy(true);
    try {
      pauseCurrent(null);
      await loadSeed(internalTimestamp(refs.seed.value), { addHistory: true, autoPlay: true });
    } catch (error) {
      console.error(error);
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function copySeed() {
    const seed = refs.seed.value.trim();
    if (!seed) return;

    try {
      await navigator.clipboard.writeText(seed);
      setStatus("timestamp copied");
    } catch {
      refs.seed.focus();
      refs.seed.select();
      setStatus("timestamp selected");
    }
  }

  function canRecordAudio() {
    return Boolean(
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      AudioContextCtor
    );
  }

  function updateTrimLabels() {
    if (!hasUploadSource()) return;

    const duration = state.uploadDuration;
    const start = Math.min(Number(refs.start.value), Math.max(0, duration - 0.01));
    const remaining = Math.max(0.01, duration - start);
    const maxLength = Math.min(CLIP_SECONDS, remaining);

    refs.start.value = start.toFixed(2);
    refs.length.max = maxLength.toFixed(2);

    if (Number(refs.length.value) > maxLength) {
      refs.length.value = maxLength.toFixed(2);
    }

    refs.startLabel.textContent = Number(refs.start.value).toFixed(2);
    refs.lengthLabel.textContent = Number(refs.length.value).toFixed(2);
  }

  function getUploadDuration(url) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();

      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        audio.removeAttribute("src");
        audio.load();

        if (Number.isFinite(duration) && duration > 0) {
          resolve(duration);
        } else {
          reject(new Error("could not read audio"));
        }
      };
      audio.onerror = () => reject(new Error("could not read audio"));
      audio.src = url;
    });
  }

  function decodeAudioBytes(bytes) {
    const context = getAudioContext();
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

    return new Promise((resolve, reject) => {
      const promise = context.decodeAudioData(copy, resolve, reject);

      if (promise && typeof promise.then === "function") {
        promise.then(resolve).catch(reject);
      }
    });
  }

  function audioBufferToMonoSamples(buffer) {
    const samples = new Float32Array(buffer.length);

    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) {
        samples[i] += data[i] / buffer.numberOfChannels;
      }
    }

    return samples;
  }

  function configureUploadControls(duration) {
    state.uploadDuration = duration;

    refs.start.disabled = false;
    refs.length.disabled = false;
    refs.start.min = "0";
    refs.start.max = Math.max(0, state.uploadDuration - 0.01).toFixed(2);
    refs.start.value = "0";
    refs.length.min = "0.01";
    refs.length.max = Math.min(CLIP_SECONDS, state.uploadDuration).toFixed(2);
    refs.length.value = Math.min(CLIP_SECONDS, state.uploadDuration).toFixed(2);

    updateTrimLabels();
  }

  async function loadUploadAudio(bytes, mime, label, file = null) {
    if (state.uploadUrl) {
      URL.revokeObjectURL(state.uploadUrl);
    }

    state.recordedClip = null;
    state.uploadFile = file;
    state.uploadMime = mime || "audio/webm";
    state.uploadBytes = bytes;
    state.uploadUrl = URL.createObjectURL(new Blob([state.uploadBytes], { type: state.uploadMime }));

    try {
      configureUploadControls(await getUploadDuration(state.uploadUrl));
    } catch (error) {
      try {
        const buffer = await decodeAudioBytes(bytes);

        URL.revokeObjectURL(state.uploadUrl);
        state.uploadUrl = null;
        state.uploadFile = null;
        state.uploadBytes = null;
        state.uploadMime = "";
        state.recordedClip = {
          samples: audioBufferToMonoSamples(buffer),
          sampleRate: buffer.sampleRate,
        };

        configureUploadControls(Math.min(CLIP_SECONDS, buffer.duration));
      } catch {
        URL.revokeObjectURL(state.uploadUrl);
        state.uploadFile = null;
        state.uploadBytes = null;
        state.uploadMime = "";
        state.uploadUrl = null;
        state.uploadDuration = 0;
        throw error;
      }
    }

    setStatus(`${label} ${state.uploadDuration.toFixed(2)}s`);
  }

  function loadRecordedSamples(samples, sampleRate, label) {
    if (state.uploadUrl) {
      URL.revokeObjectURL(state.uploadUrl);
    }

    state.uploadFile = null;
    state.uploadBytes = null;
    state.uploadMime = "";
    state.uploadUrl = null;
    state.recordedClip = { samples, sampleRate };

    configureUploadControls(Math.min(CLIP_SECONDS, samples.length / sampleRate));
    setStatus(`${label} ${state.uploadDuration.toFixed(2)}s`);
  }

  async function handleFile() {
    const file = refs.file.files && refs.file.files[0];
    if (!file || state.busy) return;

    setBusy(true, "loading upload");
    try {
      await loadUploadAudio(
        new Uint8Array(await file.arrayBuffer()),
        file.type || "audio/mpeg",
        "loaded",
        file
      );
    } catch (error) {
      console.error(error);
      setStatus("could not read audio");
    } finally {
      setBusy(false);
    }
  }

  async function recordMicrophone() {
    if (state.busy || state.recording) return;

    if (!canRecordAudio()) {
      setStatus("microphone recording is not supported");
      return;
    }

    setBusy(true, "recording 5s");
    state.recording = true;
    updateButtons();

    let stream = null;
    let context = null;
    let source = null;
    let processor = null;
    let silent = null;

    try {
      pauseCurrent(null);
      stopPreview();

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      context = await resumeAudioContext();
      source = context.createMediaStreamSource(stream);
      processor = context.createScriptProcessor(2048, 1, 1);
      silent = context.createGain();
      silent.gain.value = 0;

      const chunks = [];
      let timeout = null;

      const recording = await new Promise((resolve) => {
        function finish() {
          if (timeout) {
            window.clearTimeout(timeout);
            timeout = null;
          }

          processor.onaudioprocess = null;

          const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const samples = new Float32Array(totalLength);
          let offset = 0;

          for (const chunk of chunks) {
            samples.set(chunk, offset);
            offset += chunk.length;
          }

          resolve({ samples, sampleRate: context.sampleRate });
        }

        processor.onaudioprocess = (event) => {
          chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
        };

        source.connect(processor);
        processor.connect(silent);
        silent.connect(context.destination);

        timeout = window.setTimeout(finish, CLIP_SECONDS * 1000);
      });

      if (!recording.samples.length) {
        throw new Error("could not record audio");
      }

      loadRecordedSamples(recording.samples, recording.sampleRate, "recorded");
    } catch (error) {
      console.error(error);
      setStatus(error.name === "NotAllowedError" ? "microphone blocked" : error.message);
    } finally {
      if (source) {
        try { source.disconnect(); } catch {}
      }
      if (processor) {
        try { processor.disconnect(); } catch {}
      }
      if (silent) {
        try { silent.disconnect(); } catch {}
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      state.recording = false;
      setBusy(false);
    }
  }

  function captureUploadSamples(start, length) {
    return new Promise(async (resolve, reject) => {
      const context = await resumeAudioContext();
      if (context.state !== "running") {
        reject(new Error("press search again"));
        return;
      }

      const audio = new Audio();
      const source = context.createMediaElementSource(audio);
      const processor = context.createScriptProcessor(2048, 1, 1);
      const silent = context.createGain();
      const chunks = [];
      const end = start + length;
      let finished = false;
      let timeout = null;

      silent.gain.value = 0;

      function cleanUp() {
        if (timeout) {
          window.clearTimeout(timeout);
          timeout = null;
        }

        processor.onaudioprocess = null;
        audio.onloadedmetadata = null;
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio.removeAttribute("src");
        audio.load();

        try {
          source.disconnect();
        } catch {}
        try {
          processor.disconnect();
        } catch {}
        try {
          silent.disconnect();
        } catch {}
      }

      function finish() {
        if (finished) return;
        finished = true;

        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const samples = new Float32Array(totalLength);
        let offset = 0;

        for (const chunk of chunks) {
          samples.set(chunk, offset);
          offset += chunk.length;
        }

        cleanUp();
        resolve({ samples, sampleRate: context.sampleRate });
      }

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(input));

        if (audio.currentTime >= end || audio.ended) {
          finish();
        }
      };

      audio.onloadedmetadata = () => {
        try {
          audio.currentTime = Math.min(start, Math.max(0, audio.duration - 0.01));
        } catch {}

        timeout = window.setTimeout(finish, Math.ceil((length + 1) * 1000));

        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise.catch((error) => {
            cleanUp();
            reject(error);
          });
        }
      };
      audio.onended = finish;
      audio.onerror = () => {
        cleanUp();
        reject(new Error("could not encode audio"));
      };

      source.connect(processor);
      processor.connect(silent);
      silent.connect(context.destination);

      audio.src = state.uploadUrl;
      audio.load();
    });
  }

  function makeBufferFromSamples(samples, sampleRate, sourceStart, selectedLength) {
    const output = createAudioBuffer(selectedLength);
    const data = output.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      const t = i / output.sampleRate;
      const position = (sourceStart + t) * sampleRate;
      const left = Math.floor(position);
      const right = Math.min(left + 1, samples.length - 1);
      const mix = position - left;

      data[i] = left >= 0 && left < samples.length
        ? samples[left] + (samples[right] - samples[left]) * mix
        : 0;
    }

    return output;
  }

  function previewBuffer(buffer) {
    return new Promise(async (resolve, reject) => {
      try {
        const context = await resumeAudioContext();
        if (context.state !== "running") {
          reject(new Error("press preview again"));
          return;
        }

        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.onended = () => {
          if (state.previewSource !== source) return;
          state.previewSource = null;
          setStatus("preview ended");
          updateButtons();
        };

        state.previewSource = source;
        source.start();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  function makeFixedAudioSeed(samples, sampleRate, selectedLength, sourceStart = 0) {
    const bytes = new Uint8Array(FIXED_SEED_BYTES);
    const lowFi = new Float32Array(FIXED_AUDIO_SAMPLE_COUNT);
    let peak = 0;

    bytes[0] = 1;

    for (let i = 0; i < lowFi.length; i++) {
      const t = i * CLIP_SECONDS / lowFi.length;
      if (t >= selectedLength) {
        lowFi[i] = 0;
        continue;
      }

      const position = (sourceStart + t) * sampleRate;
      const left = Math.floor(position);
      const right = Math.min(left + 1, samples.length - 1);
      const mix = position - left;
      const sample = left >= 0 && left < samples.length
        ? samples[left] + (samples[right] - samples[left]) * mix
        : 0;

      lowFi[i] = sample;
      peak = Math.max(peak, Math.abs(sample));
    }

    const gain = peak > 0.001 ? Math.min(12, 0.92 / peak) : 1;

    for (let i = 0; i < lowFi.length; i++) {
      const code = encodeNibble(lowFi[i] * gain);

      if (i % 2 === 0) {
        bytes[1 + (i >> 1)] = code << 4;
      } else {
        bytes[1 + (i >> 1)] |= code;
      }
    }

    return FIXED_SEED_PREFIX + bytesToBase64Url(bytes);
  }

  async function makeUploadSeed() {
    const sourceStart = Number(refs.start.value);
    const selectedLength = Math.min(
      Number(refs.length.value),
      Math.max(0.01, state.uploadDuration - sourceStart)
    );

    if (state.recordedClip) {
      return makeFixedAudioSeed(
        state.recordedClip.samples,
        state.recordedClip.sampleRate,
        selectedLength,
        sourceStart
      );
    }

    const capture = await captureUploadSamples(sourceStart, selectedLength);

    return makeFixedAudioSeed(capture.samples, capture.sampleRate, selectedLength);
  }

  async function previewUpload() {
    if (!hasUploadSource() || state.busy) return;

    setBusy(true, "previewing");
    try {
      pauseCurrent(null);
      stopPreview();

      if (state.recordedClip) {
        await previewBuffer(makeBufferFromSamples(
          state.recordedClip.samples,
          state.recordedClip.sampleRate,
          Number(refs.start.value),
          Number(refs.length.value)
        ));
      } else {
        await playPreviewAudio(
          state.uploadUrl,
          Number(refs.start.value),
          Number(refs.length.value)
        );
      }
    } catch (error) {
      console.error(error);
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  function playPreviewAudio(url, start, length) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      const end = start + length;

      state.previewAudio = audio;
      audio.preload = "auto";
      audio.playsInline = true;
      audio.onloadedmetadata = () => {
        try {
          audio.currentTime = Math.min(start, Math.max(0, audio.duration - 0.01));
        } catch {}

        const playPromise = audio.play();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise
            .then(() => {
              state.previewTimer = window.setInterval(() => {
                if (state.previewAudio !== audio) return;
                if (audio.currentTime >= end || audio.ended) {
                  stopPreview();
                  setStatus("preview ended");
                  updateButtons();
                }
              }, 40);
              resolve();
            })
            .catch(reject);
        } else {
          resolve();
        }
      };
      audio.onended = () => {
        stopPreview();
        setStatus("preview ended");
        updateButtons();
      };
      audio.onerror = () => reject(new Error("could not preview audio"));
      audio.src = url;
      audio.load();
    });
  }

  async function encodeUpload() {
    if (!hasUploadSource() || state.busy) return;

    setBusy(true, "searching");
    try {
      pauseCurrent(null);
      stopPreview();
      await loadSeed(await makeUploadSeed(), { addHistory: true, autoPlay: true });
    } catch (error) {
      console.error(error);
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function initialize() {
    await loadSeed(randomSeed(), {
      addHistory: true,
      autoPlay: true,
      status: "",
    });
  }

  refs.previous.addEventListener("click", previousSeed);
  refs.playPause.addEventListener("click", togglePlay);
  refs.next.addEventListener("click", () => nextSeed(true));
  refs.seed.addEventListener("input", updateButtons);
  refs.goSeed.addEventListener("click", goToSeed);
  refs.copySeed.addEventListener("click", copySeed);
  refs.file.addEventListener("change", handleFile);
  refs.record.addEventListener("click", recordMicrophone);
  refs.start.addEventListener("input", updateTrimLabels);
  refs.length.addEventListener("input", updateTrimLabels);
  refs.preview.addEventListener("click", previewUpload);
  refs.encode.addEventListener("click", encodeUpload);

  updateButtons();
  initialize().catch((error) => {
    console.error(error);
    setStatus(error.message);
    updateButtons();
  });
})();

let slides = [];
let currentSlideIndex = 0;
let totalSlides = 0;
let currentAudio = null;
let autoAdvance = true;
let recognition = null;
let narrationCache = {}; // Cache for pre-fetched narration data

const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const slideListItems = document.getElementById('slideListItems');
const slideCounter = document.getElementById('slideCounter');
const slideContent = document.getElementById('slideContent');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');
const autoAdvanceCheckbox = document.getElementById('autoAdvance');
const micBtn = document.getElementById('micBtn');
const questionInput = document.getElementById('questionInput');
const sendBtn = document.getElementById('sendBtn');
const qaMessages = document.getElementById('qaMessages');

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

autoAdvanceCheckbox.addEventListener('change', (e) => {
  autoAdvance = e.target.checked;
});

prevBtn.addEventListener('click', () => {
  if (currentSlideIndex > 0) {
    currentSlideIndex--;
    loadSlide(currentSlideIndex);
  }
});

nextBtn.addEventListener('click', () => {
  if (currentSlideIndex < totalSlides - 1) {
    currentSlideIndex++;
    loadSlide(currentSlideIndex);
  }
});

playBtn.addEventListener('click', playNarration);
stopBtn.addEventListener('click', stopAudio);

micBtn.addEventListener('click', toggleVoiceInput);
sendBtn.addEventListener('click', () => sendQuestion(questionInput.value));
questionInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendQuestion(questionInput.value);
});

function handleFile(file) {
  const formData = new FormData();
  formData.append('presentation', file);

  uploadArea.innerHTML = '<p>Uploading...</p>';

  fetch('/api/upload', {
    method: 'POST',
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.slides) {
      slides = data.slides;
      totalSlides = data.totalSlides;
      currentSlideIndex = 0;
      renderSlideList();
      loadSlide(0);
      enableControls();
      narrationCache = {}; // Reset cache for new file
      uploadArea.innerHTML = `
        <div class="upload-content">
          <p>Loaded: <strong>${data.fileName}</strong></p>
          <button class="browse-btn" onclick="clearPresentation()" style="margin-top:12px; background:var(--error-color); border-color:var(--error-color);">Clear Presentation</button>
        </div>
      `;
      // Start pre-fetching the first slide immediately
      prefetchSlide(0);
    }
  })
  .catch(err => {
    console.error('Upload error:', err);
    uploadArea.innerHTML = '<p style="color: #ef4444">Error uploading file</p>';
  });
}

window.clearPresentation = function() {
  slides = [];
  currentSlideIndex = 0;
  totalSlides = 0;
  narrationCache = {}; // Clear cache
  slideListItems.innerHTML = '';
  slideContent.innerHTML = '<p class="placeholder">Upload a presentation to get started</p>';
  slideCounter.textContent = 'Slide 0 of 0';
  uploadArea.innerHTML = `
    <div class="upload-content">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
      <p>Drag & drop PDF or PPTX here</p>
      <span class="or">or</span>
      <button class="browse-btn" onclick="document.getElementById('fileInput').click()">Browse Files</button>
      <input type="file" id="fileInput" accept=".pdf,.pptx" hidden>
    </div>
  `;
  
  // Re-attach event listener for the dynamically recreated file input
  document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  stopAudio();
  prevBtn.disabled = true;
  nextBtn.disabled = true;
  playBtn.disabled = true;
  stopBtn.disabled = true;
  questionInput.disabled = true;
  sendBtn.disabled = true;
  micBtn.disabled = true;
};

function renderSlideList() {
  slideListItems.innerHTML = '';
  slides.forEach((slide, index) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="slide-number">${slide.slideNumber}</span> Slide ${slide.slideNumber}`;
    li.addEventListener('click', () => {
      currentSlideIndex = index;
      loadSlide(index);
    });
    slideListItems.appendChild(li);
  });
}

function loadSlide(index) {
  currentSlideIndex = index;
  const slide = slides[index];

  slideCounter.textContent = `Slide ${index + 1} of ${totalSlides}`;

  console.log('Loading slide:', index + 1, 'imageUrl:', slide.imageUrl);

  if (slide.imageUrl) {
    slideContent.innerHTML = `
      <img 
        src="${slide.imageUrl}?t=${Date.now()}"
        alt="Slide ${slide.slideNumber}"
        style="
          width: 100%;
          height: 100%;
          object-fit: contain;
          border-radius: 8px;
          display: block;
        "
        onerror="
          console.error('Image failed to load: ${slide.imageUrl}');
          this.style.display='none';
          document.getElementById('slideTextFallback').style.display='block';
        "
      />
      <p id="slideTextFallback"
         style="display:none; padding:20px; line-height:1.7; white-space:pre-wrap;">
        ${slide.text}
      </p>
    `;
  } else {
    slideContent.innerHTML = `
      <p style="padding:20px; line-height:1.7; white-space:pre-wrap;">
        ${slide.text}
      </p>
    `;
  }

  document.querySelectorAll('.slide-list li').forEach((li, i) => {
    li.classList.toggle('active', i === index);
  });

  prevBtn.disabled = index === 0;
  nextBtn.disabled = index === totalSlides - 1;
}

function enableControls() {
  prevBtn.disabled = false;
  nextBtn.disabled = totalSlides <= 1;
  playBtn.disabled = false;
  stopBtn.disabled = false;
  questionInput.disabled = false;
  sendBtn.disabled = false;
  micBtn.disabled = false;
}

async function playNarration() {
  if (!slides[currentSlideIndex]) return;
  stopAudio();

  // 1. Check Cache first for instant playback
  if (narrationCache[currentSlideIndex]) {
    console.log('CACHE HIT: Slide', currentSlideIndex + 1);
    const data = narrationCache[currentSlideIndex];
    playAudioData(data);
    prefetchSlide(currentSlideIndex + 1); // Start pre-fetching next slide
    return;
  }

  console.log('CACHE MISS: Generating slide', currentSlideIndex + 1);
  playBtn.textContent = '⏳ Generating...';

  try {
    const res = await fetch('/api/narrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slideText: slides[currentSlideIndex].text,
        slideNumber: currentSlideIndex + 1,
        totalSlides: totalSlides
      })
    });
    const data = await res.json();
    
    if (data.audioUrl || data.narration) {
      playAudioData(data);
      prefetchSlide(currentSlideIndex + 1); // Start pre-fetching next slide
    } else {
      console.error('API Error:', data.error);
      playBtn.textContent = '▶ Play Narration';
      alert('Generation failed: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    console.error('Narration error:', err);
    playBtn.textContent = '▶ Play Narration';
  }
}

// Helper to handle audio playback and auto-advance
function playAudioData(data) {
  if (data.audioUrl) {
    currentAudio = new Audio(data.audioUrl);
    currentAudio.play();
    playBtn.textContent = '🔊 Playing...';
    currentAudio.onended = () => {
      playBtn.textContent = '▶ Play Narration';
      if (autoAdvance && currentSlideIndex < totalSlides - 1) {
        currentSlideIndex++;
        loadSlide(currentSlideIndex);
        playNarration();
      }
    };
  } else if (data.narration) {
    const utterance = new SpeechSynthesisUtterance(data.narration);
    const voices = speechSynthesis.getVoices();
    utterance.voice = voices.find(v => v.name.includes('Google US English'))
      || voices.find(v => v.lang === 'en-US')
      || voices[0];
    utterance.rate = 0.95;
    utterance.pitch = 1;
    playBtn.textContent = '🔊 Playing...';
    utterance.onend = () => {
      playBtn.textContent = '▶ Play Narration';
      if (autoAdvance && currentSlideIndex < totalSlides - 1) {
        currentSlideIndex++;
        loadSlide(currentSlideIndex);
        playNarration();
      }
    };
    speechSynthesis.speak(utterance);
  }
}

// Proactive background pre-fetching
async function prefetchSlide(index) {
  if (index >= totalSlides || narrationCache[index]) return;
  
  console.log('Pre-fetching narration for slide', index + 1);
  const slide = slides[index];

  try {
    const res = await fetch('/api/narrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slideText: slide.text,
        slideNumber: index + 1,
        totalSlides: totalSlides
      })
    });
    const data = await res.json();
    if (data.audioUrl || data.narration) {
      narrationCache[index] = data;
      console.log('Slide', index + 1, 'cached successfully');
      // If it's an audio file, prime the browser cache
      if (data.audioUrl) new Audio(data.audioUrl).load();
    }
  } catch (err) {
    console.warn('Prefetch failed for slide', index + 1, err);
  }
}

function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  
  playBtn.textContent = '▶ Play Narration';
}

function toggleVoiceInput() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('Speech recognition not supported in this browser');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (recognition) {
    recognition.stop();
    recognition = null;
    micBtn.classList.remove('listening');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    micBtn.classList.add('listening');
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    questionInput.value = transcript;
    sendQuestion(transcript);
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    micBtn.classList.remove('listening');
  };

  recognition.onend = () => {
    micBtn.classList.remove('listening');
    recognition = null;
  };

  recognition.start();
}

async function sendQuestion(question) {
  if (!question.trim()) return;
  
  const questionDiv = document.createElement('div');
  questionDiv.className = 'qa-message question';
  questionDiv.innerHTML = `<div class="question-label">You asked:</div><div>${question}</div>`;
  qaMessages.appendChild(questionDiv);

  questionInput.value = '';

  try {
    const res = await fetch('/api/qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        currentSlide: currentSlideIndex + 1,
        allSlides: slides
      })
    });

    const data = await res.json();
    renderAnswer(data);
  } catch (err) {
    console.error('Q&A error:', err);
    const answerDiv = document.createElement('div');
    answerDiv.className = 'qa-message answer';
    answerDiv.innerHTML = '<div>Error getting answer</div>';
    qaMessages.appendChild(answerDiv);
  }

  qaMessages.scrollTop = qaMessages.scrollHeight;
}

function renderAnswer(data) {
  const answerDiv = document.createElement('div');
  answerDiv.className = 'qa-message answer';
  
  let html = `<div class="answer-text">${data.answer}</div>`;
  
  if (data.disclaimer) {
    html += `<div class="disclaimer">${data.disclaimer}</div>`;
  }
  
  html += `<span class="confidence-badge ${data.confidence}">${data.confidence.toUpperCase()} confidence</span>`;
  
  answerDiv.innerHTML = html;
  qaMessages.appendChild(answerDiv);

  if (data.audioUrl) {
    const audio = new Audio(data.audioUrl);
    audio.play();
  } else if (data.answer && data.confidence === 'high') {
    const u = new SpeechSynthesisUtterance(data.answer);
    speechSynthesis.speak(u);
  }

  qaMessages.scrollTop = qaMessages.scrollHeight;
}

let slideMode = 'fit';
let zoomLevel = 100;

function setSlideMode(mode) {
  slideMode = mode;
  zoomLevel = 100;
  document.getElementById('zoomLabel').textContent = '100%';

  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(mode === 'fit' ? 'btnFit' : 'btnFill').classList.add('active');

  const img = document.querySelector('.slide-content img');
  if (!img) return;

  if (mode === 'fit') {
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.transform = 'none';
  } else if (mode === 'fill') {
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.transform = 'none';
  }
}

function adjustZoom(delta) {
  zoomLevel = Math.min(200, Math.max(50, zoomLevel + delta));
  document.getElementById('zoomLabel').textContent = zoomLevel + '%';

  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));

  const img = document.querySelector('.slide-content img');
  if (!img) return;

  img.style.objectFit = 'none';
  img.style.width = 'auto';
  img.style.height = 'auto';
  img.style.transform = `scale(${zoomLevel / 100})`;
  img.style.transformOrigin = 'top center';
}

function toggleQAPanel() {
  const overlay = document.getElementById('qaOverlay');
  overlay.classList.toggle('open');
}

// Close overlay when clicking backdrop (outside the panel)
document.getElementById('qaOverlay').addEventListener('click', function(e) {
  if (e.target === this) toggleQAPanel();
});

window.toggleFullScreen = function() {
  const slideViewer = document.querySelector('.slide-viewer');
  if (!document.fullscreenElement) {
    if (slideViewer.requestFullscreen) {
      slideViewer.requestFullscreen();
    } else if (slideViewer.webkitRequestFullscreen) { /* Safari */
      slideViewer.webkitRequestFullscreen();
    } else if (slideViewer.msRequestFullscreen) { /* IE11 */
      slideViewer.msRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) { /* Safari */
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) { /* IE11 */
      document.msExitFullscreen();
    }
  }
};
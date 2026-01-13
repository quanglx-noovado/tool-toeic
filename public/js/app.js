// Common audio and text input functionality
let audioElement = null;
let currentAudioFile = null;
let currentPlaybackRate = 1.0;

// Load audio files from server
async function loadAudioFiles() {
    const audioSelect = document.getElementById('audioSelect');
    if (!audioSelect) return;

    // Detect part number from body data attribute
    const body = document.body;
    const partNumber = body.getAttribute('data-part');
    
    try {
        // Use part-specific API if part number is available
        const apiUrl = partNumber 
            ? `/api/audio-files/${partNumber}` 
            : '/api/audio-files';
        
        const response = await fetch(apiUrl);
        const files = await response.json();
        
        // Clear existing options except the first one
        const partLabel = partNumber 
            ? `-- Chọn file từ thư mục part${partNumber} --` 
            : '-- Chọn file từ thư mục audio --';
        audioSelect.innerHTML = `<option value="">${partLabel}</option>`;
        
        if (files.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            const noFilesLabel = partNumber 
                ? `Không có file audio trong thư mục part${partNumber}` 
                : 'Không có file audio trong thư mục';
            option.textContent = noFilesLabel;
            audioSelect.appendChild(option);
        } else {
            files.forEach(file => {
                const option = document.createElement('option');
                option.value = file.url;
                option.textContent = file.name;
                audioSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading audio files:', error);
    }
}

function initAudioPlayer() {
    const fileInput = document.getElementById('audioFile');
    const audioSelect = document.getElementById('audioSelect');
    const audioPlayer = document.getElementById('audioPlayer');
    const playBtn = document.getElementById('playBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const resetBtn = document.getElementById('resetBtn');
    const speedSelect = document.getElementById('speedSelect');

    if (!audioPlayer) return;

    // Set initial audio element and playback rate
    audioElement = audioPlayer;
    audioElement.playbackRate = currentPlaybackRate;

    // Load audio files from server
    loadAudioFiles();

    // Handle file selection from dropdown
    if (audioSelect) {
        audioSelect.addEventListener('change', function(e) {
            const url = e.target.value;
            if (url) {
                audioPlayer.src = url;
                audioElement = audioPlayer;
                audioElement.playbackRate = currentPlaybackRate;
                // Clear file input
                if (fileInput) fileInput.value = '';
            }
        });
    }

    // Handle file upload
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                currentAudioFile = file;
                const url = URL.createObjectURL(file);
                audioPlayer.src = url;
                audioElement = audioPlayer;
                audioElement.playbackRate = currentPlaybackRate;
                // Clear select
                if (audioSelect) audioSelect.value = '';
            }
        });
    }

    if (playBtn) {
        playBtn.addEventListener('click', () => {
            if (audioElement) {
                audioElement.play();
            }
        });
    }

    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            if (audioElement) {
                audioElement.pause();
            }
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            if (audioElement) {
                audioElement.pause();
                audioElement.currentTime = 0;
            }
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            // Reset all text inputs
            const textAreas = document.querySelectorAll('textarea');
            textAreas.forEach(ta => ta.value = '');
            
            const textInputs = document.querySelectorAll('input[type="text"]');
            textInputs.forEach(input => input.value = '');
            
            // Reset audio
            if (audioElement) {
                audioElement.pause();
                audioElement.currentTime = 0;
                audioElement.playbackRate = 1.0;
            }
            
            // Reset conversation inputs to default (2 sentences) for Part 3 & 4
            const conversationInputs = document.getElementById('conversationInputs');
            if (conversationInputs) {
                resetConversationInputs();
            }

            // Reset speed select UI (if exists)
            if (speedSelect) {
                speedSelect.value = '1';
            }

            currentPlaybackRate = 1.0;
        });
    }

    // Handle playback speed change
    if (speedSelect) {
        speedSelect.addEventListener('change', () => {
            const rate = parseFloat(speedSelect.value);
            if (!isNaN(rate) && audioElement) {
                currentPlaybackRate = rate;
                audioElement.playbackRate = rate;
            }
        });
    }

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ignore if focused on input/textarea/select to avoid breaking typing
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
            return;
        }

        if (!audioElement) return;

        // Space: play/pause
        if (e.code === 'Space' || e.key === ' ') {
            e.preventDefault();
            if (audioElement.paused) {
                audioElement.play();
            } else {
                audioElement.pause();
            }
        }

        // Left/Right arrows: seek backward/forward 5 seconds
        const SEEK_STEP = 5;
        if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const newTime = Math.max(0, audioElement.currentTime - SEEK_STEP);
            audioElement.currentTime = newTime;
        }
        if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
            e.preventDefault();
            const newTime = Math.min(audioElement.duration || audioElement.currentTime + SEEK_STEP, audioElement.currentTime + SEEK_STEP);
            audioElement.currentTime = newTime;
        }
    });
}

// Handle add/remove sentences for Part 3 & 4
function initConversationInputs() {
    const addBtn = document.getElementById('addSentenceBtn');
    const conversationInputs = document.getElementById('conversationInputs');
    
    if (!addBtn || !conversationInputs) return;
    
    // Add remove functionality to existing remove buttons
    const existingRemoveBtns = conversationInputs.querySelectorAll('.remove-sentence-btn');
    existingRemoveBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (conversationInputs.children.length > 1) {
                btn.closest('.sentence-item').remove();
                updateSentenceNumbers();
            }
        });
    });
    
    addBtn.addEventListener('click', () => {
        const sentenceCount = conversationInputs.children.length + 1;
        const sentenceItem = document.createElement('div');
        sentenceItem.className = 'sentence-item';
        sentenceItem.innerHTML = `
            <div class="sentence-header">
                <label for="sentence${sentenceCount}">Câu ${sentenceCount}:</label>
                <button class="remove-sentence-btn" type="button">Xóa</button>
            </div>
            <input type="text" id="sentence${sentenceCount}" placeholder="Nhập câu ${sentenceCount}...">
        `;
        
        // Add remove button functionality
        const removeBtn = sentenceItem.querySelector('.remove-sentence-btn');
        removeBtn.addEventListener('click', () => {
            if (conversationInputs.children.length > 1) {
                sentenceItem.remove();
                updateSentenceNumbers();
            }
        });
        
        conversationInputs.appendChild(sentenceItem);
    });
}

function updateSentenceNumbers() {
    const conversationInputs = document.getElementById('conversationInputs');
    if (!conversationInputs) return;
    
    const sentences = conversationInputs.querySelectorAll('.sentence-item');
    sentences.forEach((sentence, index) => {
        const label = sentence.querySelector('label');
        const input = sentence.querySelector('input');
        const number = index + 1;
        
        if (label) {
            label.textContent = `Câu ${number}:`;
            label.setAttribute('for', `sentence${number}`);
        }
        
        if (input) {
            input.id = `sentence${number}`;
            input.placeholder = `Nhập câu ${number}...`;
        }
    });
}

function resetConversationInputs() {
    const conversationInputs = document.getElementById('conversationInputs');
    if (!conversationInputs) return;
    
    // Keep only first 2 sentences
    while (conversationInputs.children.length > 2) {
        conversationInputs.removeChild(conversationInputs.lastChild);
    }
    
    // Clear all inputs
    const inputs = conversationInputs.querySelectorAll('input');
    inputs.forEach(input => input.value = '');
    
    // Update sentence numbers
    updateSentenceNumbers();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initAudioPlayer();
    initConversationInputs();
});

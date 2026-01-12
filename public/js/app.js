// Common audio and text input functionality
let audioElement = null;
let currentAudioFile = null;

// Load audio files from server
async function loadAudioFiles() {
    const audioSelect = document.getElementById('audioSelect');
    if (!audioSelect) return;

    try {
        const response = await fetch('/api/audio-files');
        const files = await response.json();
        
        // Clear existing options except the first one
        audioSelect.innerHTML = '<option value="">-- Chọn file từ thư mục audio --</option>';
        
        if (files.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Không có file audio trong thư mục';
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

    if (!audioPlayer) return;

    // Load audio files from server
    loadAudioFiles();

    // Handle file selection from dropdown
    if (audioSelect) {
        audioSelect.addEventListener('change', function(e) {
            const url = e.target.value;
            if (url) {
                audioPlayer.src = url;
                audioElement = audioPlayer;
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
            }
            
            // Reset conversation inputs to default (2 sentences) for Part 3 & 4
            const conversationInputs = document.getElementById('conversationInputs');
            if (conversationInputs) {
                resetConversationInputs();
            }
        });
    }
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

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

        // Restore last selected audio
        const savedUrl = localStorage.getItem(`dictation_selected_audio_p${partNumber || '0'}`);
        if (savedUrl && Array.from(audioSelect.options).some(o => o.value === savedUrl)) {
            audioSelect.value = savedUrl;
            // Trigger change manually to load audio and state
            audioSelect.dispatchEvent(new Event('change'));
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
        audioSelect.addEventListener('change', function (e) {
            const url = e.target.value;
            if (url) {
                audioPlayer.src = url;
                audioElement = audioPlayer;
                audioElement.playbackRate = currentPlaybackRate;
                // Clear file input
                if (fileInput) fileInput.value = '';

                // Track current file for autosave
                currentAudioFile = url;
                loadState();

                // Save selection for persistence across refresh
                const part = document.body.getAttribute('data-part') || '0';
                localStorage.setItem(`dictation_selected_audio_p${part}`, url);
            }
        });
    }

    // Handle file upload
    if (fileInput) {
        fileInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (file) {
                const url = URL.createObjectURL(file);
                audioPlayer.src = url;
                audioElement = audioPlayer;
                audioElement.playbackRate = currentPlaybackRate;
                // Clear select
                if (audioSelect) audioSelect.value = '';

                // Track current file name for autosave
                currentAudioFile = file.name;
                loadState();
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

    // Global keyboard shortcuts - control audio only when NOT typing in text inputs
    document.addEventListener('keydown', (e) => {
        if (!audioElement) return;

        // Check if user is typing in a text input/textarea
        const target = e.target;
        const isTextInput = target && (
            (target.tagName === 'TEXTAREA') ||
            (target.tagName === 'INPUT' && target.type !== 'button' && target.type !== 'submit' && target.type !== 'reset' && target.type !== 'checkbox' && target.type !== 'radio')
        );

        // If typing in text input, don't control audio
        if (isTextInput) {
            return;
        }

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
                <div class="header-actions">
                    <button class="translate-btn" data-target="sentence${sentenceCount}">Dịch câu</button>
                    <button class="remove-sentence-btn" type="button">Xóa</button>
                </div>
            </div>
            <input type="text" id="sentence${sentenceCount}" placeholder="Nhập câu ${sentenceCount}..." class="dictation-input">
        `;

        // Add remove button functionality
        const removeBtn = sentenceItem.querySelector('.remove-sentence-btn');
        removeBtn.addEventListener('click', () => {
            if (conversationInputs.children.length > 1) {
                sentenceItem.remove();
                updateSentenceNumbers();
                saveState(); // Save after removal
            }
        });

        // Add input listener for autosave
        const input = sentenceItem.querySelector('input');
        input.addEventListener('input', () => saveState());

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
        const translateBtn = sentence.querySelector('.translate-btn');
        const number = index + 1;

        if (label) {
            label.textContent = `Câu ${number}:`;
            label.setAttribute('for', `sentence${number}`);
        }

        if (input) {
            input.id = `sentence${number}`;
            input.placeholder = `Nhập câu ${number}...`;
        }

        if (translateBtn) {
            translateBtn.setAttribute('data-target', `sentence${number}`);
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
    initTheme();
    initAudioPlayer();
    initConversationInputs();
    initDictionary();
    initQuickLookup();
    initTranslation();

    // Add autosave listener to all inputs
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('dictation-input') || e.target.tagName === 'TEXTAREA') {
            saveState();
        }
    });

    // Theme toggle listener
    const themeBtn = document.querySelector('.theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }

    // Load history if on home page
    if (document.body.getAttribute('data-page') === 'home') {
        displayHistory();
    }
});

// Theme logic
function initTheme() {
    const savedTheme = localStorage.getItem('dictation_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('dictation_theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const themeBtn = document.querySelector('.theme-toggle');
    if (themeBtn) {
        themeBtn.textContent = theme === 'light' ? '🌙' : '☀️';
    }
}

// Auto-save logic
function getStorageKey() {
    if (!currentAudioFile) return null;
    const part = document.body.getAttribute('data-part') || 'unknown';
    // Clean key name: remove special chars and use filename only
    const fileName = currentAudioFile.split('/').pop();
    return `dictation_autosave_p${part}_${fileName}`;
}

function saveState() {
    const key = getStorageKey();
    if (!key) return;

    const data = {
        timestamp: Date.now(),
        inputs: {}
    };

    const inputs = document.querySelectorAll('.dictation-input, textarea');
    inputs.forEach(input => {
        if (input.id) {
            data.inputs[input.id] = input.value;
        }
    });

    // Special case for dynamic conversation inputs (Part 3 & 4)
    const conversationInputs = document.getElementById('conversationInputs');
    if (conversationInputs) {
        data.sentenceCount = conversationInputs.children.length;
    }

    localStorage.setItem(key, JSON.stringify(data));

    // Save to global history as well
    saveProgress(part, fileName);
}

function loadState() {
    const key = getStorageKey();
    if (!key) return;

    const saved = localStorage.getItem(key);
    if (!saved) return;

    try {
        const data = JSON.parse(saved);

        // Handle dynamic conversation inputs first
        const conversationInputs = document.getElementById('conversationInputs');
        if (conversationInputs && data.sentenceCount) {
            // Add sentences if needed
            while (conversationInputs.children.length < data.sentenceCount) {
                document.getElementById('addSentenceBtn').click();
            }
        }

        // Restore values
        Object.keys(data.inputs).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.value = data.inputs[id];
            }
        });

        console.log(`Restored state for: ${key}`);
    } catch (e) {
        console.error('Error loading saved state:', e);
    }
}

// Progress Tracking logic
function saveProgress(part, fileName) {
    const historyKey = 'dictation_history';
    let history = JSON.parse(localStorage.getItem(historyKey) || '[]');

    // Find existing entry or create new
    const entryId = `p${part}_${fileName}`;
    let entry = history.find(h => h.id === entryId);

    if (entry) {
        entry.lastUpdate = Date.now();
    } else {
        entry = {
            id: entryId,
            part: part,
            name: fileName,
            startTime: Date.now(),
            lastUpdate: Date.now()
        };
        history.unshift(entry);
    }

    // Keep only last 10 items
    history = history.slice(0, 10);
    localStorage.setItem(historyKey, JSON.stringify(history));
}

function displayHistory() {
    const section = document.getElementById('historySection');
    const list = document.getElementById('historyList');
    if (!section || !list) return;

    const history = JSON.parse(localStorage.getItem('dictation_history') || '[]');
    if (history.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    list.innerHTML = history.map(h => `
        <div class="history-item">
            <div class="history-info">
                <strong>Part ${h.part}</strong>
                <span>${h.name}</span>
                <div class="history-date">Lần cuối: ${new Date(h.lastUpdate).toLocaleString('vi-VN')}</div>
            </div>
            <a href="part${h.part}.html" class="btn btn-primary" style="padding: 6px 12px; font-size: 12px; text-decoration: none;">Tiếp tục</a>
        </div>
    `).join('');
}

// Dictionary Functionality
function initDictionary() {
    const sidebar = document.getElementById('dictionarySidebar');
    const toggleBtn = document.getElementById('toggleDict');
    const closeBtn = document.getElementById('closeDict');
    const searchBtn = document.getElementById('dictSearchBtn');
    const searchInput = document.getElementById('dictInput');

    if (!sidebar || !toggleBtn) return;

    function setDictState(isOpen) {
        if (isOpen) {
            sidebar.classList.add('active');
            document.body.classList.add('dict-open');
            searchInput.focus();
        } else {
            sidebar.classList.remove('active');
            document.body.classList.remove('dict-open');
        }
    }

    toggleBtn.addEventListener('click', () => {
        const isOpen = !sidebar.classList.contains('active');
        setDictState(isOpen);
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => setDictState(false));
    }

    if (searchBtn && searchInput) {
        searchBtn.addEventListener('click', () => searchWord(searchInput.value));
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchWord(searchInput.value);
        });
    }
}

async function searchWord(word) {
    if (!word || word.trim() === '') return;

    const resultsContainer = document.getElementById('dictResults');
    if (!resultsContainer) return;

    resultsContainer.innerHTML = '<p style="color: #666; font-style: italic;">Đang tìm kiếm...</p>';

    // Ensure sidebar is open
    document.getElementById('dictionarySidebar').classList.add('active');
    document.body.classList.add('dict-open');

    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.trim().toLowerCase()}`);
        if (!response.ok) throw new Error('Not found');

        const data = await response.json();
        displayDictResults(data[0]);
    } catch (error) {
        resultsContainer.innerHTML = '<p style="color: #dc3545;">Không tìm thấy định nghĩa cho từ này.</p>';
    }
}

function displayDictResults(entry) {
    const container = document.getElementById('dictResults');

    // Find first available audio
    const audioObj = entry.phonetics.find(p => p.audio && p.audio !== '');
    const audioUrl = audioObj ? audioObj.audio : null;

    let html = `
        <div class="dict-word-header">
            <h4>${entry.word} ${entry.phonetic ? `<small style="color: #999;">[${entry.phonetic}]</small>` : ''}</h4>
            ${audioUrl ? `<button class="dict-audio-btn" onclick="playWordAudio('${audioUrl}')">🔊</button>` : ''}
        </div>
    `;

    entry.meanings.forEach(meaning => {
        html += `<div style="margin-bottom: 15px;">
            <p style="font-weight: 600; color: var(--primary-color); margin-bottom: 5px;">${meaning.partOfSpeech}</p>
            <ul style="padding-left: 20px;">`;

        meaning.definitions.slice(0, 3).forEach(def => {
            html += `<li class="dict-definition">${def.definition}
                ${def.example ? `<div class="dict-example">"${def.example}"</div>` : ''}
            </li>`;
        });

        html += `</ul></div>`;
    });

    container.innerHTML = html;
}

function playWordAudio(url) {
    const audio = new Audio(url);
    audio.play().catch(e => console.error('Audio playback error:', e));
}

// Quick Lookup: search when double clicking a word
function initQuickLookup() {
    document.addEventListener('dblclick', (e) => {
        if (e.target.classList.contains('dictation-input') || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            const selection = window.getSelection().toString().trim();
            if (selection && /^[a-zA-Z]+$/.test(selection)) {
                searchWord(selection);
                const searchInput = document.getElementById('dictInput');
                if (searchInput) searchInput.value = selection;
            }
        }
    });
}

// Sentence Translation Functionality
function initTranslation() {
    // Use event delegation to handle both existing and dynamic buttons
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('translate-btn')) {
            handleTranslateClick(e.target);
        }
    });
}

async function handleTranslateClick(btn) {
    const targetId = btn.getAttribute('data-target');
    const targetInput = document.getElementById(targetId);
    if (!targetInput) return;

    const text = targetInput.value.trim();
    if (!text) {
        alert('Vui lòng nhập văn bản cần dịch.');
        return;
    }

    if (btn.classList.contains('loading')) return;

    btn.classList.add('loading');
    btn.textContent = '⌛ Đang dịch...';

    try {
        // Google Translate lookup (unofficial API for sentences)
        const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(text)}`);
        if (!response.ok) throw new Error('Translation failed');

        const data = await response.json();
        const translation = data[0].map(s => s[0]).join(''); // Combine all translated segments

        displayTranslationHint(targetInput, translation);
    } catch (error) {
        console.error('Translation error:', error);
        alert('Có lỗi xảy ra khi dịch. Vui lòng thử lại.');
    } finally {
        btn.classList.remove('loading');
        btn.textContent = 'Dịch câu';
    }
}

function displayTranslationHint(input, translation) {
    let hintEl = input.parentNode.querySelector('.translation-hint');
    if (!hintEl) {
        hintEl = document.createElement('div');
        hintEl.className = 'translation-hint';
        input.parentNode.appendChild(hintEl);
    }

    hintEl.innerHTML = `<strong>Dịch:</strong> ${translation}`;
}


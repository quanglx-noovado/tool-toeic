// Parse time string to seconds
function parseTime(timeStr) {
    if (!timeStr || timeStr.trim() === '') return null;

    const parts = timeStr.trim().split(':');
    if (parts.length === 1) {
        // Just seconds
        return parseFloat(parts[0]);
    } else if (parts.length === 2) {
        // MM:SS
        return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    } else if (parts.length === 3) {
        // HH:MM:SS
        return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    }
    return null;
}

// Format seconds to MM:SS
function formatTime(seconds) {
    if (seconds === null || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Format seconds to MM:SS for input (keeps decimals for precision if needed)
function formatTimeMMSS(seconds) {
    if (seconds === null || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Initialize timestamp inputs
function initTimestampInputs() {
    const container = document.getElementById('timestampInputs');
    container.innerHTML = '';
    const audioPlayer = document.getElementById('audioPlayer');

    // Part 3 has 13 groups of 3 questions each (32-34, 35-37, ..., 68-70)
    for (let i = 1; i <= 13; i++) {
        const startQ = 32 + (i - 1) * 3;
        const endQ = startQ + 2;

        const item = document.createElement('div');
        item.className = 'timestamp-item';
        item.innerHTML = `
            <h4>Nhóm ${i} (Câu ${startQ}-${endQ})</h4>
            <div class="time-input-group">
                <label>Bắt đầu:</label>
                <div style="display: flex; gap: 5px; flex: 1;">
                    <input type="text" id="start${i}" placeholder="00:00" class="time-input">
                    <button class="capture-btn" data-target="start${i}" title="Lấy thời gian hiện tại">📍</button>
                </div>
            </div>
            <div class="time-input-group">
                <label>Kết thúc:</label>
                <div style="display: flex; gap: 5px; flex: 1;">
                    <input type="text" id="end${i}" placeholder="00:00" class="time-input">
                    <button class="capture-btn" data-target="end${i}" title="Lấy thời gian hiện tại">📍</button>
                </div>
            </div>
            <div class="duration-display" id="duration${i}"></div>
        `;
        container.appendChild(item);

        // Add event listeners for capture buttons
        item.querySelectorAll('.capture-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-target');
                const input = document.getElementById(targetId);
                if (audioPlayer && !isNaN(audioPlayer.currentTime)) {
                    input.value = formatTimeMMSS(audioPlayer.currentTime);
                    updateDuration();
                }
            });
        });

        // Add event listeners for time calculation
        const startInput = item.querySelector(`#start${i}`);
        const endInput = item.querySelector(`#end${i}`);
        const durationDisplay = item.querySelector(`#duration${i}`);

        function updateDuration() {
            const start = parseTime(startInput.value);
            const end = parseTime(endInput.value);

            if (start !== null && end !== null && end > start) {
                const duration = end - start;
                durationDisplay.textContent = `Thời lượng: ${formatTime(duration)}`;
                durationDisplay.style.color = '#28a745';
            } else {
                durationDisplay.textContent = '';
            }
            validateInputs();
        }

        startInput.addEventListener('input', updateDuration);
        endInput.addEventListener('input', updateDuration);
    }
    validateInputs();
}

// Validate all inputs
function validateInputs() {
    let allValid = true;
    let missingField = null;

    for (let i = 1; i <= 13; i++) {
        const startVal = document.getElementById(`start${i}`).value;
        const endVal = document.getElementById(`end${i}`).value;
        const start = parseTime(startVal);
        const end = parseTime(endVal);

        if (start === null || end === null || end <= start) {
            allValid = false;
            missingField = i;
            break;
        }
    }

    const splitBtn = document.getElementById('splitBtn');
    const audioFile = document.getElementById('audioFile');
    const hasFile = audioFile && audioFile.files && audioFile.files[0];

    if (!allValid) {
        console.log(`Validation failed at group ${missingField}`);
    }
    if (!hasFile) {
        console.log('No audio file selected');
    }

    splitBtn.disabled = !allValid || !hasFile;
    console.log(`Button state updated: disabled=${splitBtn.disabled} (allValid=${allValid}, hasFile=${hasFile})`);
}

// Get audio duration
async function getAudioDuration(file) {
    const formData = new FormData();
    formData.append('audio', file);

    try {
        const response = await fetch('/api/audio-duration', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to get audio duration');
        }

        const data = await response.json();
        return data.duration;
    } catch (error) {
        console.error('Error getting audio duration:', error);
        return null;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const audioFile = document.getElementById('audioFile');
    const audioPlayer = document.getElementById('audioPlayer');
    const audioPreview = document.getElementById('audioPreview');
    const getDurationBtn = document.getElementById('getDurationBtn');
    const audioDuration = document.getElementById('audioDuration');
    const splitBtn = document.getElementById('splitBtn');
    const progressSection = document.getElementById('progressSection');
    const resultSection = document.getElementById('resultSection');
    const autoSplitBtn = document.getElementById('autoSplitBtn');
    const autoModeBtn = document.getElementById('autoModeBtn');
    const manualModeBtn = document.getElementById('manualModeBtn');
    const manualSection = document.getElementById('manualSection');
    const autoSection = document.getElementById('autoSection');

    initTimestampInputs();

    // Toggle between auto and manual mode
    autoModeBtn.addEventListener('click', () => {
        manualSection.style.display = 'none';
        autoSection.style.display = 'block';
        autoModeBtn.classList.add('btn-primary');
        autoModeBtn.classList.remove('btn-secondary');
        manualModeBtn.classList.remove('btn-primary');
        manualModeBtn.classList.add('btn-secondary');
    });

    manualModeBtn.addEventListener('click', () => {
        manualSection.style.display = 'block';
        autoSection.style.display = 'none';
        manualModeBtn.classList.add('btn-primary');
        manualModeBtn.classList.remove('btn-secondary');
        autoModeBtn.classList.remove('btn-primary');
        autoModeBtn.classList.add('btn-secondary');
    });

    // Auto split button
    autoSplitBtn.addEventListener('click', async () => {
        const file = audioFile.files[0];
        if (!file) {
            alert('Vui lòng upload file audio trước');
            return;
        }

        // Show progress
        progressSection.classList.add('active');
        resultSection.classList.remove('active');
        autoSplitBtn.disabled = true;
        autoSplitBtn.textContent = 'Đang xử lý...';

        // Prepare form data
        const formData = new FormData();
        formData.append('audio', file);

        try {
            const response = await fetch('/api/auto-split-part3', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Show results
                progressSection.classList.remove('active');
                resultSection.classList.add('active');

                const resultFiles = document.getElementById('resultFiles');
                resultFiles.innerHTML = `
                    <h4>Files đã tạo (Phương thức: ${data.method === 'silence-detection' ? 'Phát hiện khoảng lặng' : 'Chia đều'}${data.method === 'manual' ? 'Thủ công' : ''})</h4>
                    <p style="color: #666; margin-top: 10px;">Thời gian cắt:</p>
                `;

                // Sort files by group to ensure correct order
                const sortedFiles = [...data.files].sort((a, b) => a.group - b.group);

                sortedFiles.forEach(file => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'result-file-item';
                    fileItem.innerHTML = `
                        <div style="flex: 1;">
                            <div><strong>Nhóm ${file.group} (Câu ${file.questionRange}):</strong> ${file.filename}</div>
                            <div style="font-size: 12px; color: #666; margin-top: 5px;">
                                ${file.start}s - ${file.end}s
                            </div>
                        </div>
                        <audio controls style="width: 200px; height: 30px;">
                            <source src="${file.url}" type="audio/mpeg">
                        </audio>
                    `;
                    resultFiles.appendChild(fileItem);
                });
            } else {
                alert('Lỗi: ' + (data.error || 'Không thể tự động cắt audio'));
                progressSection.classList.remove('active');
            }
        } catch (error) {
            console.error('Error auto-splitting audio:', error);
            alert('Lỗi: ' + error.message);
            progressSection.classList.remove('active');
        } finally {
            autoSplitBtn.disabled = false;
            autoSplitBtn.textContent = '🤖 Tự động cắt Audio';
        }
    });

    // Handle file selection
    audioFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Show audio preview
        const url = URL.createObjectURL(file);
        audioPlayer.src = url;
        audioPreview.style.display = 'block';
        getDurationBtn.style.display = 'inline-block';

        // Get duration
        getDurationBtn.addEventListener('click', async () => {
            getDurationBtn.disabled = true;
            getDurationBtn.textContent = 'Đang xử lý...';

            const duration = await getAudioDuration(file);

            if (duration) {
                const minutes = Math.floor(duration / 60);
                const seconds = Math.floor(duration % 60);
                audioDuration.textContent = `Thời lượng: ${minutes}:${seconds.toString().padStart(2, '0')} (${duration.toFixed(2)} giây)`;
                audioDuration.style.color = '#28a745';
            } else {
                audioDuration.textContent = 'Không thể lấy thời lượng audio';
                audioDuration.style.color = '#dc3545';
            }

            getDurationBtn.disabled = false;
            getDurationBtn.textContent = 'Lấy thời lượng audio';
        });

        validateInputs();
    });

    validateInputs();
    // Handle split button
    splitBtn.addEventListener('click', async () => {
        const file = audioFile.files[0];
        if (!file) return;

        // Collect timestamps
        const timestamps = [];
        for (let i = 1; i <= 13; i++) {
            const start = parseTime(document.getElementById(`start${i}`).value);
            const end = parseTime(document.getElementById(`end${i}`).value);

            if (start === null || end === null || end <= start) {
                alert(`Vui lòng nhập thời gian hợp lệ cho nhóm ${i}`);
                return;
            }

            timestamps.push({ start, end });
        }

        // Show progress
        progressSection.classList.add('active');
        resultSection.classList.remove('active');
        splitBtn.disabled = true;

        // Prepare form data
        const formData = new FormData();
        formData.append('audio', file);
        formData.append('timestamps', JSON.stringify(timestamps));

        try {
            const response = await fetch('/api/split-part3', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Show results
                progressSection.classList.remove('active');
                resultSection.classList.add('active');

                const resultFiles = document.getElementById('resultFiles');
                resultFiles.innerHTML = '<h4>Files đã tạo:</h4>';

                // Sort files by group to ensure correct order
                const sortedFiles = [...data.files].sort((a, b) => a.group - b.group);

                sortedFiles.forEach(file => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'result-file-item';
                    fileItem.innerHTML = `
                        <div style="flex: 1;">
                            <div><strong>Nhóm ${file.group} (Câu ${file.questionRange}):</strong> ${file.filename}</div>
                            <div style="font-size: 12px; color: #666; margin-top: 5px;">
                                ${file.start}s - ${file.end}s
                            </div>
                        </div>
                        <audio controls style="width: 200px; height: 30px;">
                            <source src="${file.url}" type="audio/mpeg">
                        </audio>
                    `;
                    resultFiles.appendChild(fileItem);
                });
            } else {
                alert('Lỗi: ' + (data.error || 'Không thể cắt audio'));
                progressSection.classList.remove('active');
            }
        } catch (error) {
            console.error('Error splitting audio:', error);
            alert('Lỗi: ' + error.message);
            progressSection.classList.remove('active');
        } finally {
            splitBtn.disabled = false;
        }
    });

    // Validate on input change
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('time-input')) {
            validateInputs();
        }
    });

    validateInputs();
});

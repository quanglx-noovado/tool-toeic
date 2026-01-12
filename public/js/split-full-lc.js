document.addEventListener('DOMContentLoaded', () => {
    const audioFile = document.getElementById('audioFile');
    const audioPlayer = document.getElementById('audioPlayer');
    const audioPreview = document.getElementById('audioPreview');
    const audioDuration = document.getElementById('audioDuration');
    const splitBtn = document.getElementById('splitBtn');
    const progressSection = document.getElementById('progressSection');
    const resultSection = document.getElementById('resultSection');

    // Handle file selection
    audioFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) {
            splitBtn.disabled = true;
            return;
        }

        // Show audio preview
        const url = URL.createObjectURL(file);
        audioPlayer.src = url;
        audioPreview.style.display = 'block';
        splitBtn.disabled = false;

        // Get duration
        const formData = new FormData();
        formData.append('audio', file);
        
        try {
            const response = await fetch('/api/audio-duration', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.duration) {
                const minutes = Math.floor(data.duration / 60);
                const seconds = Math.floor(data.duration % 60);
                audioDuration.textContent = `Thời lượng: ${minutes}:${seconds.toString().padStart(2, '0')} (${data.duration.toFixed(2)} giây)`;
                audioDuration.style.color = '#28a745';
            }
        } catch (error) {
            console.error('Error getting duration:', error);
        }
    });

    // Handle split button
    splitBtn.addEventListener('click', async () => {
        const file = audioFile.files[0];
        if (!file) return;

        // Show progress
        progressSection.classList.add('active');
        resultSection.classList.remove('active');
        splitBtn.disabled = true;
        splitBtn.textContent = 'Đang xử lý...';

        // Prepare form data
        const formData = new FormData();
        formData.append('audio', file);

        try {
            const response = await fetch('/api/split-full-lc', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Show results
                progressSection.classList.remove('active');
                resultSection.classList.add('active');

                const partResults = document.getElementById('partResults');
                partResults.innerHTML = '';

                // Display results for each part
                for (const [partKey, partData] of Object.entries(data.results)) {
                    const partNumber = partKey.replace('part', '');
                    const partDiv = document.createElement('div');
                    partDiv.className = 'part-result';
                    partDiv.innerHTML = `
                        <h4>Part ${partNumber}</h4>
                        <div class="file-count">Đã tạo ${partData.files.length} file</div>
                        <div style="font-size: 12px; color: #666;">
                            Phương thức: ${partData.method === 'silence-detection' ? 'Phát hiện khoảng lặng' : 'Chia đều'}
                        </div>
                    `;
                    partResults.appendChild(partDiv);
                }

                // Show metadata info
                if (data.metadata) {
                    const metadataDiv = document.createElement('div');
                    metadataDiv.className = 'part-result';
                    metadataDiv.style.background = '#fff3cd';
                    metadataDiv.innerHTML = `
                        <h4>📋 Metadata đã lưu</h4>
                        <p style="margin: 5px 0;">File gốc: ${data.metadata.originalFile}</p>
                        <p style="margin: 5px 0;">Thời lượng: ${Math.floor(data.metadata.totalDuration / 60)}:${Math.floor(data.metadata.totalDuration % 60)}</p>
                        <p style="margin: 5px 0; color: #666; font-size: 14px;">Thông tin đã được lưu vào file JSON metadata</p>
                    `;
                    partResults.appendChild(metadataDiv);
                }
            } else {
                alert('Lỗi: ' + (data.error || 'Không thể cắt audio'));
                progressSection.classList.remove('active');
            }
        } catch (error) {
            console.error('Error splitting full LC:', error);
            alert('Lỗi: ' + error.message);
            progressSection.classList.remove('active');
        } finally {
            splitBtn.disabled = false;
            splitBtn.textContent = '🚀 Cắt Full LC Audio';
        }
    });
});

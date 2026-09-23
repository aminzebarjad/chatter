// ==================== ماژول VoiceManager ====================
class VoiceManager {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.startTime = null;
        this.timerInterval = null;
        this.isRecording = false;
        this.shouldSend = false;
        this.onSendCallback = null;

        // محدودیت‌ها (هماهنگ با script.js)
        this.MAX_DURATION = 45;      // حداکثر ۴۵ ثانیه
        this.BITRATE = 24000;        // 24 kbps

        this.recordingIndicator = document.getElementById('recordingIndicator');
        this.recordingTimeSpan = document.querySelector('.recording-time');
        this.cancelBtn = document.getElementById('cancelRecordingBtn');
        this.sendBtn = document.getElementById('sendRecordingBtn');
        this.voiceBtn = document.getElementById('voiceBtn');

        this.initEventListeners();
    }

    initEventListeners() {
        if (this.voiceBtn) {
            this.voiceBtn.addEventListener('click', () => this.toggleRecording());
        }
        if (this.cancelBtn) {
            this.cancelBtn.addEventListener('click', () => this.cancelRecording());
        }
        if (this.sendBtn) {
            this.sendBtn.addEventListener('click', () => this.finishRecording(true));
        }
    }

    setOnSend(callback) {
        this.onSendCallback = callback;
    }

    async toggleRecording() {
        if (this.isRecording) {
            this.finishRecording(true);
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            this.stream = stream;

            // انتخاب بهترین MIME type موجود
            const mimeType = this.getSupportedMimeType();
            const options = { mimeType };
            if (this.BITRATE) options.audioBitsPerSecond = this.BITRATE;

            this.mediaRecorder = new MediaRecorder(stream, options);
            this.audioChunks = [];
            this.isRecording = true;
            this.shouldSend = false;
            this.startTime = Date.now();

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = () => this.handleStop();
            this.mediaRecorder.start(100);
            this.startTimer();
            this.showRecordingIndicator(true);

            console.log('[Voice] Recording started, MIME:', mimeType, 'Bitrate:', this.BITRATE);
        } catch (err) {
            console.error('[Voice] Microphone access error:', err);
            alert('برای ارسال پیام صوتی باید دسترسی به میکروفون را اجازه دهید.');
        }
    }

    getSupportedMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4',
            'audio/mpeg'
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return '';
    }

    finishRecording(send = true) {
        if (!this.isRecording || !this.mediaRecorder) return;
        this.shouldSend = send;
        this.mediaRecorder.stop();
    }

    cancelRecording() {
        this.finishRecording(false);
    }

    async handleStop() {
        const duration = (Date.now() - this.startTime) / 1000;
        this.cleanup();

        if (this.shouldSend && this.audioChunks.length > 0 && duration >= 0.5) {
            const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
            console.log('[Voice] Blob size:', (blob.size / 1024).toFixed(1) + ' KB');

            const reader = new FileReader();
            reader.onloadend = async () => {
                if (this.onSendCallback) {
                    await this.onSendCallback(reader.result, Math.floor(duration));
                }
            };
            reader.readAsDataURL(blob);
        } else if (duration < 0.5 && this.shouldSend) {
            alert('صدای ضبط شده بسیار کوتاه است. لطفاً دوباره تلاش کنید.');
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.startTime = null;
        this.shouldSend = false;
        this.showRecordingIndicator(false);
    }

    showRecordingIndicator(show) {
        if (this.recordingIndicator) {
            this.recordingIndicator.classList.toggle('hidden', !show);
        }
        if (this.voiceBtn) {
            this.voiceBtn.classList.toggle('recording', show);
        }
    }

    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            if (!this.startTime) return;
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            if (this.recordingTimeSpan) {
                this.recordingTimeSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
            // توقف خودکار
            if (elapsed >= this.MAX_DURATION) {
                this.finishRecording(true);
            }
        }, 100);
    }

    cleanup() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    // ========== پخش صدا در پیام‌ها ==========
    static attachVoicePlayers() {
        document.querySelectorAll('.voice-message').forEach(voiceDiv => {
            if (voiceDiv.dataset.voiceHandlerAttached === 'true') return;
            voiceDiv.dataset.voiceHandlerAttached = 'true';

            const playBtn = voiceDiv.querySelector('.voice-play-btn');
            const audioData = voiceDiv.getAttribute('data-audio');
            let audio = null;

            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();

                // توقف سایر صداها
                document.querySelectorAll('.voice-message').forEach(vd => {
                    if (vd === voiceDiv) return;
                    const otherAudio = vd._audioInstance;
                    if (otherAudio && !otherAudio.paused) {
                        otherAudio.pause();
                        otherAudio.currentTime = 0;
                        vd.classList.remove('playing');
                    }
                });

                // اگر همین در حال پخشه، متوقف کن
                if (audio && !audio.paused) {
                    audio.pause();
                    audio.currentTime = 0;
                    voiceDiv.classList.remove('playing');
                    return;
                }

                // اگر از قبل ساخته شده، ادامه بده
                if (audio) {
                    audio.play();
                    voiceDiv.classList.add('playing');
                    return;
                }

                // ساخت آبجکت صوتی جدید
                try {
                    audio = new Audio(audioData);
                    voiceDiv._audioInstance = audio;

                    audio.addEventListener('ended', () => {
                        voiceDiv.classList.remove('playing');
                        audio.currentTime = 0;
                    });

                    audio.addEventListener('pause', () => {
                        if (audio.currentTime === 0) {
                            voiceDiv.classList.remove('playing');
                        }
                    });

                    audio.addEventListener('error', (err) => {
                        console.error('[Voice] Playback error:', err);
                        voiceDiv.classList.remove('playing');
                    });

                    audio.play();
                    voiceDiv.classList.add('playing');
                } catch (err) {
                    console.error('[Voice] Cannot play audio:', err);
                    alert('خطا در پخش صدا');
                }
            });
        });
    }
}

window.voiceManager = new VoiceManager();
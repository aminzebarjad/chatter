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
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.stream = stream;
            this.mediaRecorder = new MediaRecorder(stream);
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
        } catch (err) {
            console.error('خطا در دسترسی به میکروفون:', err);
            alert('برای ارسال پیام صوتی باید دسترسی به میکروفون را اجازه دهید.');
        }
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
            if (elapsed >= 60) {
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

                // توقف سایر صداهای در حال پخش
                document.querySelectorAll('.voice-message').forEach(vd => {
                    if (vd === voiceDiv) return;
                    const otherAudio = vd._audioInstance;
                    if (otherAudio && !otherAudio.paused) {
                        otherAudio.pause();
                        otherAudio.currentTime = 0;
                        vd.classList.remove('playing');
                    }
                });

                // اگر همین دارد پخش می‌شود، متوقف کن
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

                    audio.play();
                    voiceDiv.classList.add('playing');
                } catch (err) {
                    console.error('پخش صدا ممکن نیست', err);
                    alert('خطا در پخش صدا');
                }
            });
        });
    }
}

window.voiceManager = new VoiceManager();
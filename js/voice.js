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
        this.actualMimeType = 'audio/webm';

        this.MAX_DURATION = 45;
        this.BITRATE = 24000;

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

    // ✅ اولویت MIME بر اساس پلتفرم
    getSupportedMimeType() {
        const ua = navigator.userAgent || '';
        const isIOS = /iPad|iPhone|iPod/.test(ua) ||
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isSafari = /^((?!chrome|android).)*safari/i.test(ua);

        const iosOrder = [
            'audio/mp4',
            'audio/mp4;codecs=mp4a.40.2',
            'audio/aac',
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus'
        ];
        const desktopOrder = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4',
            'audio/mpeg'
        ];

        const order = (isIOS || isSafari) ? iosOrder : desktopOrder;

        for (const type of order) {
            try {
                if (MediaRecorder.isTypeSupported(type)) {
                    console.log('[Voice] Selected MIME:', type);
                    return type;
                }
            } catch (e) { /* skip */ }
        }
        console.warn('[Voice] No supported MIME found, using browser default');
        return '';
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

            const mimeType = this.getSupportedMimeType();
            const options = {};
            if (mimeType) options.mimeType = mimeType;
            if (this.BITRATE) options.audioBitsPerSecond = this.BITRATE;

            this.mediaRecorder = new MediaRecorder(stream, options);

            // ✅ MIME واقعی رو ذخیره کن (ممکنه با اون چیزی که درخواست کردیم فرق کنه)
            this.actualMimeType = this.mediaRecorder.mimeType || mimeType || 'audio/webm';
            console.log('[Voice] Actual MIME:', this.actualMimeType);

            this.audioChunks = [];
            this.isRecording = true;
            this.shouldSend = false;
            this.startTime = Date.now();

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => this.handleStop();
            this.mediaRecorder.onerror = (e) => {
                console.error('[Voice] Recorder error:', e);
                this.isRecording = false;
            };

            this.mediaRecorder.start(100);
            this.startTimer();
            this.showRecordingIndicator(true);
        } catch (err) {
            console.error('[Voice] Microphone access error:', err);
            alert('برای ارسال پیام صوتی باید دسترسی به میکروفون را اجازه دهید.');
        }
    }

    finishRecording(send = true) {
        if (!this.isRecording || !this.mediaRecorder) return;
        this.shouldSend = send;
        try {
            this.mediaRecorder.stop();
        } catch (e) {
            console.error('[Voice] Stop error:', e);
            this.cleanup();
            this.showRecordingIndicator(false);
            this.isRecording = false;
        }
    }

    cancelRecording() {
        this.finishRecording(false);
    }

    async handleStop() {
        const duration = (Date.now() - this.startTime) / 1000;
        this.cleanup();

        if (this.shouldSend && this.audioChunks.length > 0 && duration >= 0.5) {
            // ✅ از MIME واقعی استفاده کن، نه هاردکد
            const blobType = this.actualMimeType || 'audio/webm';
            const blob = new Blob(this.audioChunks, { type: blobType });
            console.log('[Voice] Blob:', blobType, '| size:', (blob.size / 1024).toFixed(1) + ' KB');

            const reader = new FileReader();
            reader.onloadend = async () => {
                if (this.onSendCallback) {
                    // ✅ MIME رو هم به callback بفرست
                    await this.onSendCallback(reader.result, Math.floor(duration), blobType);
                }
            };
            reader.onerror = (e) => {
                console.error('[Voice] FileReader error:', e);
                alert('خطا در پردازش صدا');
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

    // ========== پخش صدا ==========
    static attachVoicePlayers() {
        document.querySelectorAll('.voice-message').forEach(voiceDiv => {
            if (voiceDiv.dataset.voiceHandlerAttached === 'true') return;
            voiceDiv.dataset.voiceHandlerAttached = 'true';

            const playBtn = voiceDiv.querySelector('.voice-play-btn');
            if (!playBtn) return;

            // ✅ داده از property عنصر خونده می‌شه، نه از attribute
            const audioData = voiceDiv._audioData;
            if (!audioData) {
                console.warn('[Voice] No audio data on element');
                return;
            }

            let audio = null;

            const stopOther = () => {
                document.querySelectorAll('.voice-message').forEach(vd => {
                    if (vd === voiceDiv) return;
                    const otherAudio = vd._audioInstance;
                    if (otherAudio && !otherAudio.paused) {
                        try {
                            otherAudio.pause();
                            otherAudio.currentTime = 0;
                        } catch (e) { /* ignore */ }
                        vd.classList.remove('playing');
                    }
                });
            };

            const resetBtn = () => {
                voiceDiv.classList.remove('playing');
            };

            playBtn.addEventListener('click', async (e) => {
                e.stopPropagation();

                stopOther();

                // متوقف کردن اگر در حال پخشه
                if (audio && !audio.paused) {
                    try {
                        audio.pause();
                        audio.currentTime = 0;
                    } catch (err) { /* ignore */ }
                    resetBtn();
                    return;
                }

                // ادامه پخش قبلی
                if (audio) {
                    try {
                        await audio.play();
                        voiceDiv.classList.add('playing');
                    } catch (err) {
                        console.error('[Voice] Resume failed:', err);
                        resetBtn();
                        alert('خطا در پخش صدا');
                    }
                    return;
                }

                // ساخت Audio جدید
                try {
                    audio = new Audio();
                    audio.preload = 'auto';
                    audio.src = audioData;
                    voiceDiv._audioInstance = audio;

                    audio.addEventListener('ended', () => {
                        resetBtn();
                        try { audio.currentTime = 0; } catch (e) { /* ignore */ }
                    });

                    audio.addEventListener('error', (err) => {
                        console.error('[Voice] Audio error:', err, 'src prefix:', audioData.slice(0, 40));
                        resetBtn();
                        alert('پخش این پیام صوتی ممکن نیست. لطفاً دوباره ضبط کنید.');
                    });

                    await audio.play();
                    voiceDiv.classList.add('playing');
                } catch (err) {
                    console.error('[Voice] Play failed:', err);
                    resetBtn();
                    alert('خطا در پخش صدا. لطفاً مطمئن شوید مرورگر از این فرمت پشتیبانی می‌کند.');
                }
            });
        });
    }
}

window.voiceManager = new VoiceManager();
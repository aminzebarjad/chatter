// ==================== تنظیمات ====================
const REPO_OWNER = 'aminzebarjad';
const REPO_NAME = 'chatter';
const ADMIN_USERNAME = 'aminzebarjad';
const API_FILE_PATH = 'chat.json';
const PASSWORD_FILE_PATH = 'password.json';

const RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${API_FILE_PATH}`;
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${API_FILE_PATH}`;
const PASSWORD_RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${PASSWORD_FILE_PATH}`;
const PASSWORD_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${PASSWORD_FILE_PATH}`;

// ==================== ابزارهای UTF-8 ====================
function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    const binString = String.fromCharCode(...bytes);
    return btoa(binString);
}

function base64ToUtf8(base64) {
    const binString = atob(base64);
    const bytes = Uint8Array.from(binString, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

// ==================== وضعیت برنامه ====================
let currentToken = '';
let currentUsername = '';
let currentAvatar = '';
let messages = [];
let refreshInterval = null;
let justSent = false;

// ==================== صدای نوتیفیکیشن ====================
let audioCtx = null;
function playNotificationSound() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = 600;
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.15);
}

// ==================== LocalStorage ====================
function saveToken(token) {
    localStorage.setItem('chatter_github_token', token);
}
function getSavedToken() {
    return localStorage.getItem('chatter_github_token');
}
function clearToken() {
    localStorage.removeItem('chatter_github_token');
}

// ==================== رمز چت‌روم ====================
async function getCurrentChatPassword() {
    try {
        const res = await fetch(PASSWORD_RAW_URL);
        if (!res.ok) throw new Error('فایل رمز یافت نشد');
        const data = await res.json();
        return data.password;
    } catch (e) {
        console.warn('خطا در دریافت رمز، استفاده از رمز پیش‌فرض 1234', e);
        return '1234';
    }
}

// ==================== مودال اختصاصی confirm ====================
function customConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('customConfirmModal');
        const messageEl = document.getElementById('confirmMessage');
        const yesBtn = document.getElementById('confirmYesBtn');
        const noBtn = document.getElementById('confirmNoBtn');

        messageEl.textContent = message;
        modal.classList.add('show');

        const onYes = () => {
            modal.classList.remove('show');
            cleanup();
            resolve(true);
        };
        const onNo = () => {
            modal.classList.remove('show');
            cleanup();
            resolve(false);
        };

        function cleanup() {
            yesBtn.removeEventListener('click', onYes);
            noBtn.removeEventListener('click', onNo);
        }

        yesBtn.addEventListener('click', onYes);
        noBtn.addEventListener('click', onNo);
    });
}

// ==================== المان‌های DOM ====================
const passwordScreen = document.getElementById('passwordScreen');
const tokenScreen = document.getElementById('tokenScreen');
const chatScreen = document.getElementById('chatScreen');

// ==================== راهنما ====================
document.getElementById('showGuideBtn').addEventListener('click', () => {
    document.getElementById('guideBox').classList.toggle('visible');
});

// ==================== خروج ====================
document.getElementById('logoutBtn').addEventListener('click', async () => {
    const confirmed = await customConfirm('آیا از خروج مطمئنی؟');
    if (confirmed) {
        clearToken();
        currentToken = '';
        currentUsername = '';
        currentAvatar = '';
        messages = [];
        if (refreshInterval) clearInterval(refreshInterval);
        switchScreen('password');
    }
});

// ==================== پاک کردن چت ====================
document.getElementById('clearChatBtn').addEventListener('click', async () => {
    if (currentUsername !== ADMIN_USERNAME) return;
    const confirmed = await customConfirm('آیا از پاک کردن تمام پیام‌ها مطمئنی؟');
    if (confirmed) {
        await clearAllMessages();
    }
});

// ==================== تغییر رمز ====================
const modal = document.getElementById('changePasswordModal');
const closeModal = document.querySelector('.modal-close');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const submitPasswordChange = document.getElementById('submitPasswordChangeBtn');

function openModal() {
    modal.classList.add('show');
    document.getElementById('oldPasswordInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('confirmPasswordInput').value = '';
    document.getElementById('passwordChangeError').textContent = '';
}
function closeModalFunc() {
    modal.classList.remove('show');
}
closeModal.addEventListener('click', closeModalFunc);
window.addEventListener('click', (e) => {
    if (e.target === modal) closeModalFunc();
});

submitPasswordChange.addEventListener('click', async () => {
    const oldPass = document.getElementById('oldPasswordInput').value.trim();
    const newPass = document.getElementById('newPasswordInput').value.trim();
    const confirmPass = document.getElementById('confirmPasswordInput').value.trim();
    const errorEl = document.getElementById('passwordChangeError');

    if (!oldPass || !newPass || !confirmPass) {
        errorEl.textContent = 'همه فیلدها را پر کنید';
        return;
    }
    if (newPass !== confirmPass) {
        errorEl.textContent = 'رمز جدید و تأیید آن مطابقت ندارند';
        return;
    }
    if (newPass.length < 3) {
        errorEl.textContent = 'رمز جدید حداقل باید ۳ کاراکتر باشد';
        return;
    }

    const currentPass = await getCurrentChatPassword();
    if (oldPass !== currentPass) {
        errorEl.textContent = 'رمز فعلی اشتباه است';
        return;
    }

    try {
        const getRes = await fetch(PASSWORD_API_URL, {
            headers: { 'Authorization': `token ${currentToken}` }
        });
        if (!getRes.ok) throw new Error('دریافت فایل رمز ناموفق');
        const { sha } = await getRes.json();

        const newContent = { password: newPass };
        const putRes = await fetch(PASSWORD_API_URL, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `تغییر رمز چت‌روم توسط ${currentUsername}`,
                content: utf8ToBase64(JSON.stringify(newContent, null, 2)),
                sha: sha
            })
        });

        if (!putRes.ok) {
            const err = await putRes.json();
            errorEl.textContent = 'خطا در ذخیره رمز: ' + err.message;
            return;
        }

        alert('✅ رمز چت‌روم با موفقیت تغییر کرد');
        closeModalFunc();
    } catch (e) {
        errorEl.textContent = 'مشکل در ارتباط با گیت‌هاب';
    }
});

// ==================== مرحله ۱: رمز عبور ====================
document.getElementById('checkPasswordBtn').addEventListener('click', handlePassword);
document.getElementById('roomPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handlePassword();
});

async function handlePassword() {
    const pass = document.getElementById('roomPassword').value;
    const errorEl = document.getElementById('passwordError');
    const currentPass = await getCurrentChatPassword();
    if (pass === currentPass) {
        errorEl.textContent = '';
        attemptAutoLogin();
    } else {
        errorEl.textContent = '❌ رمز اشتباه است';
    }
}

async function attemptAutoLogin() {
    const savedToken = getSavedToken();
    if (!savedToken) {
        switchScreen('token');
        return;
    }
    try {
        const res = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${savedToken}` }
        });
        if (!res.ok) {
            clearToken();
            switchScreen('token');
            return;
        }
        const userData = await res.json();
        currentUsername = userData.login;
        currentAvatar = userData.avatar_url;
        currentToken = savedToken;
        switchScreen('chat');
        startChat();
    } catch (e) {
        switchScreen('token');
    }
}

// ==================== مرحله ۲: اتصال توکن ====================
document.getElementById('connectBtn').addEventListener('click', connectManual);
document.getElementById('tokenInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') connectManual();
});

async function connectManual() {
    const tokenInput = document.getElementById('tokenInput');
    const errorEl = document.getElementById('tokenError');
    const token = tokenInput.value.trim();
    if (!token) {
        errorEl.textContent = 'توکن را وارد کن';
        return;
    }
    errorEl.textContent = 'در حال بررسی...';
    try {
        const res = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${token}` }
        });
        if (!res.ok) {
            errorEl.textContent = '❌ توکن نامعتبر یا دسترسی ناکافی';
            return;
        }
        const userData = await res.json();
        currentUsername = userData.login;
        currentAvatar = userData.avatar_url;
        currentToken = token;
        saveToken(token);
        tokenInput.value = '';
        switchScreen('chat');
        startChat();
    } catch (e) {
        errorEl.textContent = '⚠️ مشکل در اتصال';
    }
}

// ==================== جابجایی بین صفحات ====================
function switchScreen(name) {
    passwordScreen.classList.remove('active');
    tokenScreen.classList.remove('active');
    chatScreen.classList.remove('active');
    if (name === 'password') passwordScreen.classList.add('active');
    else if (name === 'token') tokenScreen.classList.add('active');
    else if (name === 'chat') chatScreen.classList.add('active');
}

// ==================== شروع محیط چت ====================
function startChat() {
    document.getElementById('currentUser').innerHTML = `
        <img src="${currentAvatar}" alt="avatar"> ${currentUsername}
    `;
    const clearBtn = document.getElementById('clearChatBtn');
    const changePassBtn = document.getElementById('changePasswordBtn');
    if (currentUsername === ADMIN_USERNAME) {
        clearBtn.classList.remove('hidden');
        changePassBtn.classList.remove('hidden');
        changePassBtn.addEventListener('click', openModal);
    } else {
        clearBtn.classList.add('hidden');
        changePassBtn.classList.add('hidden');
    }
    justSent = false;
    loadMessages();
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(loadMessages, 4000);
}

// ==================== بارگذاری پیام‌ها ====================
async function loadMessages() {
    if (!currentToken) return;
    try {
        const res = await fetch(API_URL, {
            headers: { 'Authorization': `token ${currentToken}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        const content = JSON.parse(base64ToUtf8(data.content));

        if (justSent && content.length < messages.length) {
            return;
        }

        if (JSON.stringify(content) !== JSON.stringify(messages)) {
            const isFirstLoad = messages.length === 0;
            messages = content;
            renderMessages();
            if (!isFirstLoad) playNotificationSound();
            if (justSent && content.length >= messages.length) {
                justSent = false;
            }
        }
    } catch (e) {
        console.warn('بارگذاری پیام‌ها با خطا مواجه شد', e);
    }
}

// ==================== ارسال پیام متنی ====================
async function sendMessage() {
    const input = document.getElementById('msgInput');
    const text = input.value.trim();
    if (!text || !currentToken || !currentUsername) return;

    const newMsg = {
        sender: currentUsername,
        text: text,
        time: Date.now(),
        avatar: currentAvatar,
        type: 'text'
    };

    const updated = [...messages, newMsg];
    try {
        const getRes = await fetch(API_URL, {
            headers: { 'Authorization': `token ${currentToken}` }
        });
        if (!getRes.ok) throw new Error('دریافت فایل ناموفق');
        const { sha } = await getRes.json();

        const putRes = await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `پیام از ${currentUsername}`,
                content: utf8ToBase64(JSON.stringify(updated, null, 2)),
                sha: sha
            })
        });

        if (!putRes.ok) {
            const err = await putRes.json();
            alert('خطا در ارسال: ' + err.message);
            return;
        }

        input.value = '';
        messages = updated;
        justSent = true;
        renderMessages();
        input.focus();
    } catch (e) {
        alert('مشکل در ارسال پیام');
    }
}

// ==================== ارسال پیام صوتی ====================
async function sendVoiceMessage(base64Data, duration) {
    if (!currentToken || !currentUsername) return;

    const newMsg = {
        sender: currentUsername,
        time: Date.now(),
        avatar: currentAvatar,
        type: 'voice',
        data: base64Data,
        duration: duration
    };

    const updated = [...messages, newMsg];
    try {
        const getRes = await fetch(API_URL, {
            headers: { 'Authorization': `token ${currentToken}` }
        });
        if (!getRes.ok) throw new Error('دریافت فایل ناموفق');
        const { sha } = await getRes.json();

        const putRes = await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `پیام صوتی از ${currentUsername}`,
                content: utf8ToBase64(JSON.stringify(updated, null, 2)),
                sha: sha
            })
        });

        if (!putRes.ok) {
            const err = await putRes.json();
            alert('خطا در ارسال ویس: ' + err.message);
            return;
        }

        messages = updated;
        justSent = true;
        renderMessages();
    } catch (e) {
        alert('مشکل در ارسال پیام صوتی');
    }
}

// ==================== پاک‌سازی کامل چت ====================
async function clearAllMessages() {
    if (!currentToken || currentUsername !== ADMIN_USERNAME) return;
    try {
        const getRes = await fetch(API_URL, {
            headers: { 'Authorization': `token ${currentToken}` }
        });
        if (!getRes.ok) throw new Error('دریافت فایل ناموفق');
        const { sha } = await getRes.json();

        const putRes = await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: 'پاک‌سازی چت توسط ادمین',
                content: utf8ToBase64('[]'),
                sha: sha
            })
        });

        if (!putRes.ok) {
            const err = await putRes.json();
            alert('خطا در پاک‌سازی: ' + err.message);
            return;
        }
        messages = [];
        justSent = false;
        renderMessages();
    } catch (e) {
        alert('مشکل در پاک‌سازی چت');
    }
}

// ==================== نمایش پیام‌ها (پشتیبانی از ویس) ====================
function renderMessages() {
    const container = document.getElementById('messages');
    container.innerHTML = '';
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.sender === currentUsername ? 'own' : ''}`;
        
        let avatarUrl = msg.avatar;
        if (!avatarUrl) avatarUrl = `https://github.com/${msg.sender}.png`;
        const timeStr = formatTime(msg.time);
        
        let contentHtml = '';
        if (msg.type === 'voice' && msg.data) {
            // پیام صوتی
            const duration = msg.duration || 0;
            const minutes = Math.floor(duration / 60);
            const seconds = Math.floor(duration % 60);
            const durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            contentHtml = `
                <div class="voice-message" data-audio="${msg.data}" data-duration="${duration}">
                    <button class="voice-play-btn">▶️</button>
                    <div class="voice-wave">
                        <span></span><span></span><span></span><span></span>
                    </div>
                    <span class="voice-duration">${durationText}</span>
                </div>
            `;
        } else {
            // پیام متنی (سازگاری با پیام‌های قدیمی)
            const text = msg.text || '';
            contentHtml = `<span class="text">${escapeHtml(text)}</span>`;
        }
        
        div.innerHTML = `
            <div class="msg-header">
                <img class="sender-avatar" src="${avatarUrl}" alt="">
                <span class="sender-name">${escapeHtml(msg.sender)}</span>
            </div>
            ${contentHtml}
            <div class="time">${timeStr}</div>
        `;
        container.appendChild(div);
    });
    
    // راه‌اندازی رویدادهای پخش صدا
    document.querySelectorAll('.voice-message').forEach(voiceDiv => {
        const playBtn = voiceDiv.querySelector('.voice-play-btn');
        const waveDiv = voiceDiv.querySelector('.voice-wave');
        const audioData = voiceDiv.getAttribute('data-audio');
        let audio = null;
        let isPlaying = false;
        
        playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (audio && !audio.paused) {
                audio.pause();
                audio.currentTime = 0;
                playBtn.textContent = '▶️';
                waveDiv.classList.remove('playing');
                isPlaying = false;
                return;
            }
            if (audio) {
                audio.play();
                playBtn.textContent = '⏸️';
                waveDiv.classList.add('playing');
                isPlaying = true;
                return;
            }
            // ساخت آبجکت صوتی از base64
            try {
                audio = new Audio(audioData);
                audio.addEventListener('ended', () => {
                    playBtn.textContent = '▶️';
                    waveDiv.classList.remove('playing');
                    isPlaying = false;
                });
                audio.play();
                playBtn.textContent = '⏸️';
                waveDiv.classList.add('playing');
                isPlaying = true;
            } catch (err) {
                console.error('پخش صدا ممکن نیست', err);
                alert('خطا در پخش صدا');
            }
        });
    });
    
    container.scrollTop = container.scrollHeight;
}

function formatTime(timestamp) {
    const d = new Date(timestamp);
    try {
        return d.toLocaleString('fa-IR', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        return d.toLocaleString();
    }
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// ==================== ضبط صدا ====================
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingTimer = null;
let recordingStream = null;

const voiceBtn = document.getElementById('voiceBtn');
const recordingIndicator = document.getElementById('recordingIndicator');
const recordingTimeSpan = document.querySelector('.recording-time');
const cancelRecordingBtn = document.getElementById('cancelRecordingBtn');
const sendRecordingBtn = document.getElementById('sendRecordingBtn');

voiceBtn.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        // در حال ضبط است – متوقف کن
        stopRecordingAndSend(false);
        return;
    }
    // درخواست دسترسی به میکروفون
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordingStream = stream;
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = async () => {
            // توقف ضبط – آماده ارسال
            const duration = (Date.now() - recordingStartTime) / 1000;
            if (audioChunks.length === 0 || duration < 0.5) {
                alert('صدایی ضبط نشد. لطفاً دوباره تلاش کنید.');
                resetRecording();
                return;
            }
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64Audio = reader.result; // data:audio/webm;base64,...
                sendVoiceMessage(base64Audio, Math.floor(duration));
                resetRecording();
            };
            reader.readAsDataURL(blob);
        };
        
        mediaRecorder.start(100);
        recordingStartTime = Date.now();
        recordingIndicator.classList.remove('hidden');
        startRecordingTimer();
        
    } catch (err) {
        console.error('دسترسی به میکروفون ممکن نیست', err);
        alert('برای ارسال پیام صوتی باید دسترسی به میکروفون را允许 دهید.');
    }
});

function startRecordingTimer() {
    if (recordingTimer) clearInterval(recordingTimer);
    recordingTimer = setInterval(() => {
        if (!recordingStartTime) return;
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        recordingTimeSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        // حداکثر 60 ثانیه
        if (elapsed >= 60) {
            stopRecordingAndSend(true);
        }
    }, 100);
}

function stopRecordingAndSend(send = false) {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
    if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
        recordingStream = null;
    }
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
    recordingIndicator.classList.add('hidden');
    if (!send) {
        // لغو
        audioChunks = [];
        recordingStartTime = null;
    }
    // برای ارسال، در onstop هندل می‌شود
}

function resetRecording() {
    if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
        recordingStream = null;
    }
    if (recordingTimer) clearInterval(recordingTimer);
    recordingIndicator.classList.add('hidden');
    audioChunks = [];
    recordingStartTime = null;
    mediaRecorder = null;
}

cancelRecordingBtn.addEventListener('click', () => {
    stopRecordingAndSend(false);
    resetRecording();
});

sendRecordingBtn.addEventListener('click', () => {
    stopRecordingAndSend(true);
});

// ==================== پنل اموجی ====================
const emojis = [
    '😀','😂','😍','😎','😢','😡','👍','👎','❤️','🔥',
    '🎉','💔','🤣','🥲','😊','😇','🙂','😴','🤔','😉',
    '🌟','⭐','🎈','✨','💯','💤','🕒','📌','📎','💬'
];
const stickers = [
    '😍','👍','🎉','💔','🤣','🔥','😎','❤️','🥲','⭐'
];

let pickerTab = 'emojis';
const emojiPicker = document.getElementById('emojiPicker');
const pickerContent = document.getElementById('pickerContent');

document.getElementById('emojiBtn').addEventListener('click', () => {
    emojiPicker.classList.toggle('visible');
    if (emojiPicker.classList.contains('visible')) {
        renderPicker(pickerTab);
    }
});

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        pickerTab = e.target.dataset.tab;
        renderPicker(pickerTab);
    });
});

function renderPicker(type) {
    pickerContent.innerHTML = '';
    const list = type === 'stickers' ? stickers : emojis;
    list.forEach(emoji => {
        const span = document.createElement('span');
        span.className = 'emoji-item';
        span.textContent = emoji;
        span.addEventListener('click', () => {
            insertEmoji(emoji);
            emojiPicker.classList.remove('visible');
        });
        pickerContent.appendChild(span);
    });
}

function insertEmoji(emoji) {
    const input = document.getElementById('msgInput');
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;
    input.value = text.substring(0, start) + emoji + text.substring(end);
    input.selectionStart = input.selectionEnd = start + emoji.length;
    input.focus();
}

document.addEventListener('click', (e) => {
    if (!emojiPicker.contains(e.target) && e.target !== document.getElementById('emojiBtn')) {
        emojiPicker.classList.remove('visible');
    }
});

// ==================== دکمه ارسال و Enter ====================
document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('msgInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// ==================== تولتیپ ====================
let activeTooltip = null;
let tooltipTimeout = null;

function createTooltip(text) {
    const tooltip = document.createElement('div');
    tooltip.className = 'custom-tooltip';
    tooltip.textContent = text;
    document.body.appendChild(tooltip);
    return tooltip;
}

function positionTooltip(tooltip, target) {
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const spacing = 10;
    let top, left;
    const spaceTop = targetRect.top - tooltipRect.height - spacing;
    const spaceBottom = window.innerHeight - targetRect.bottom - tooltipRect.height - spacing;
    if (spaceTop >= 0 && (spaceTop >= spaceBottom)) {
        top = targetRect.top - tooltipRect.height - spacing;
        tooltip.classList.add('tooltip-top');
        tooltip.classList.remove('tooltip-bottom');
    } else if (spaceBottom >= 0) {
        top = targetRect.bottom + spacing;
        tooltip.classList.add('tooltip-bottom');
        tooltip.classList.remove('tooltip-top');
    } else {
        top = Math.max(5, targetRect.top - tooltipRect.height - 5);
        tooltip.classList.add('tooltip-top');
        tooltip.classList.remove('tooltip-bottom');
    }
    left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
    if (left < 5) left = 5;
    if (left + tooltipRect.width > window.innerWidth - 5) {
        left = window.innerWidth - tooltipRect.width - 5;
    }
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
}

function showTooltip(target, text) {
    if (activeTooltip) activeTooltip.remove();
    if (tooltipTimeout) clearTimeout(tooltipTimeout);
    activeTooltip = createTooltip(text);
    positionTooltip(activeTooltip, target);
    requestAnimationFrame(() => activeTooltip.classList.add('visible'));
}

function hideTooltip() {
    if (activeTooltip) {
        activeTooltip.classList.remove('visible');
        tooltipTimeout = setTimeout(() => {
            if (activeTooltip) activeTooltip.remove();
            activeTooltip = null;
        }, 200);
    }
}

function initTooltips() {
    const elements = document.querySelectorAll('[data-tooltip]');
    elements.forEach(el => {
        el.addEventListener('mouseenter', () => {
            const text = el.getAttribute('data-tooltip');
            if (text) showTooltip(el, text);
        });
        el.addEventListener('mouseleave', hideTooltip);
    });
    let touchTimeout = null;
    elements.forEach(el => {
        el.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const text = el.getAttribute('data-tooltip');
            if (!text) return;
            if (activeTooltip && activeTooltip._trigger === el) {
                hideTooltip();
                return;
            }
            hideTooltip();
            showTooltip(el, text);
            if (activeTooltip) activeTooltip._trigger = el;
            if (touchTimeout) clearTimeout(touchTimeout);
            touchTimeout = setTimeout(() => {
                hideTooltip();
                touchTimeout = null;
            }, 2000);
        });
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('[data-tooltip]')) hideTooltip();
    });
    window.addEventListener('scroll', hideTooltip);
    window.addEventListener('resize', () => {
        if (activeTooltip && activeTooltip._trigger) {
            positionTooltip(activeTooltip, activeTooltip._trigger);
        }
    });
}

// ==================== شروع برنامه ====================
document.addEventListener('DOMContentLoaded', () => {
    initTooltips();
});
switchScreen('password');

// ==================== تنظیمات ====================
const REPO_OWNER = 'aminzebarjad';
const REPO_NAME = 'chatter';
const ADMIN_USERNAME = 'aminzebarjad';
const API_FILE_PATH = 'chat.json';
const PASSWORD_FILE_PATH = 'password.json';

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

// ==================== ابزارهای نمایش ====================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// ==================== وضعیت برنامه ====================
let currentToken = '';
let currentUsername = '';
let currentAvatar = '';
let messages = [];
let refreshInterval = null;
let justSent = false;
let pickerTab = 'emojis';

// ==================== صدای نوتیفیکیشن ====================
let audioCtx = null;
function playNotificationSound() {
    try {
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
    } catch (e) { /* silent */ }
}

// ==================== LocalStorage ====================
function saveToken(token) { localStorage.setItem('chatter_github_token', token); }
function getSavedToken() { return localStorage.getItem('chatter_github_token'); }
function clearToken() { localStorage.removeItem('chatter_github_token'); }

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

        const onYes = () => { modal.classList.remove('show'); cleanup(); resolve(true); };
        const onNo = () => { modal.classList.remove('show'); cleanup(); resolve(false); };

        function cleanup() {
            yesBtn.removeEventListener('click', onYes);
            noBtn.removeEventListener('click', onNo);
        }
        yesBtn.addEventListener('click', onYes);
        noBtn.addEventListener('click', onNo);
    });
}

// ==================== DOM ====================
const passwordScreen = document.getElementById('passwordScreen');
const tokenScreen = document.getElementById('tokenScreen');
const chatScreen = document.getElementById('chatScreen');

// ==================== راهنما ====================
document.getElementById('showGuideBtn').addEventListener('click', () => {
    document.getElementById('guideBox').classList.toggle('hidden');
    document.getElementById('guideChevron').classList.toggle('rotate-180');
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
    if (confirmed) await clearAllMessages();
});

// ==================== تغییر رمز ====================
const modal = document.getElementById('changePasswordModal');
const closeModal = document.querySelector('.modal-close');
const submitPasswordChange = document.getElementById('submitPasswordChangeBtn');

function openModal() {
    modal.classList.add('show');
    document.getElementById('oldPasswordInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('confirmPasswordInput').value = '';
    document.getElementById('passwordChangeError').textContent = '';
}
function closeModalFunc() { modal.classList.remove('show'); }

closeModal.addEventListener('click', closeModalFunc);
window.addEventListener('click', (e) => {
    if (e.target === modal || e.target.hasAttribute('data-close-modal')) closeModalFunc();
});

submitPasswordChange.addEventListener('click', async () => {
    const oldPass = document.getElementById('oldPasswordInput').value.trim();
    const newPass = document.getElementById('newPasswordInput').value.trim();
    const confirmPass = document.getElementById('confirmPasswordInput').value.trim();
    const errorEl = document.getElementById('passwordChangeError');

    if (!oldPass || !newPass || !confirmPass) { errorEl.textContent = 'همه فیلدها را پر کنید'; return; }
    if (newPass !== confirmPass) { errorEl.textContent = 'رمز جدید و تأیید آن مطابقت ندارند'; return; }
    if (newPass.length < 3) { errorEl.textContent = 'رمز جدید حداقل باید ۳ کاراکتر باشد'; return; }

    const currentPass = await getCurrentChatPassword();
    if (oldPass !== currentPass) { errorEl.textContent = 'رمز فعلی اشتباه است'; return; }

    try {
        const getRes = await fetch(PASSWORD_API_URL, { headers: { 'Authorization': `token ${currentToken}` } });
        if (!getRes.ok) throw new Error('دریافت فایل رمز ناموفق');
        const { sha } = await getRes.json();

        const newContent = { password: newPass };
        const putRes = await fetch(PASSWORD_API_URL, {
            method: 'PUT',
            headers: { 'Authorization': `token ${currentToken}`, 'Content-Type': 'application/json' },
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

// ==================== مرحله ۱ ====================
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
    if (!savedToken) { switchScreen('token'); return; }
    try {
        const res = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${savedToken}` }
        });
        if (!res.ok) { clearToken(); switchScreen('token'); return; }
        const userData = await res.json();
        currentUsername = userData.login;
        currentAvatar = userData.avatar_url;
        currentToken = savedToken;
        switchScreen('chat');
        startChat();
    } catch (e) { switchScreen('token'); }
}

// ==================== مرحله ۲ ====================
document.getElementById('connectBtn').addEventListener('click', connectManual);
document.getElementById('tokenInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') connectManual();
});

async function connectManual() {
    const tokenInput = document.getElementById('tokenInput');
    const errorEl = document.getElementById('tokenError');
    const token = tokenInput.value.trim();
    if (!token) { errorEl.textContent = 'توکن را وارد کن'; return; }
    errorEl.textContent = 'در حال بررسی...';
    try {
        const res = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${token}` }
        });
        if (!res.ok) { errorEl.textContent = '❌ توکن نامعتبر یا دسترسی ناکافی'; return; }
        const userData = await res.json();
        currentUsername = userData.login;
        currentAvatar = userData.avatar_url;
        currentToken = token;
        saveToken(token);
        tokenInput.value = '';
        errorEl.textContent = '';
        switchScreen('chat');
        startChat();
    } catch (e) { errorEl.textContent = '⚠️ مشکل در اتصال'; }
}

// ==================== جابجایی صفحات ====================
function switchScreen(name) {
    passwordScreen.classList.remove('active');
    tokenScreen.classList.remove('active');
    chatScreen.classList.remove('active');
    if (name === 'password') passwordScreen.classList.add('active');
    else if (name === 'token') tokenScreen.classList.add('active');
    else if (name === 'chat') chatScreen.classList.add('active');
}

// ==================== شروع چت ====================
function startChat() {
    const avatarEl = document.getElementById('currentUserAvatar');
    const nameEl = document.getElementById('currentUserName');
    if (avatarEl) avatarEl.src = currentAvatar;
    if (nameEl) nameEl.textContent = currentUsername;

    const clearBtn = document.getElementById('clearChatBtn');
    const changePassBtn = document.getElementById('changePasswordBtn');

    if (currentUsername === ADMIN_USERNAME) {
        clearBtn.classList.remove('hidden');
        changePassBtn.classList.remove('hidden');
        changePassBtn.onclick = openModal;
    } else {
        clearBtn.classList.add('hidden');
        changePassBtn.classList.add('hidden');
    }

    justSent = false;
    loadMessages();

    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(loadMessages, 4000);

    if (window.voiceManager) {
        window.voiceManager.setOnSend(async (base64Audio, duration) => {
            await sendVoiceMessage(base64Audio, duration);
        });
    }
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

        if (justSent && content.length < messages.length) return;

        if (JSON.stringify(content) !== JSON.stringify(messages)) {
            const isFirstLoad = messages.length === 0;
            messages = content;
            renderMessages();
            if (!isFirstLoad) playNotificationSound();
            if (justSent && content.length >= messages.length) justSent = false;
            if (window.VoiceManager) VoiceManager.attachVoicePlayers();
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
            headers: { 'Authorization': `token ${currentToken}`, 'Content-Type': 'application/json' },
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
async function sendVoiceMessage(base64Audio, duration) {
    if (!currentToken || !currentUsername) {
        alert('لطفاً ابتدا وارد شوید');
        return false;
    }

    const newMsg = {
        sender: currentUsername,
        time: Date.now(),
        avatar: currentAvatar,
        type: 'voice',
        data: base64Audio,
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
            headers: { 'Authorization': `token ${currentToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `پیام صوتی از ${currentUsername}`,
                content: utf8ToBase64(JSON.stringify(updated, null, 2)),
                sha: sha
            })
        });

        if (!putRes.ok) {
            const err = await putRes.json();
            alert('خطا در ارسال پیام صوتی: ' + err.message);
            return false;
        }
        messages = updated;
        justSent = true;
        renderMessages();
        return true;
    } catch (e) {
        alert('مشکل در ارسال پیام صوتی: ' + e.message);
        return false;
    }
}

// ==================== پاک‌سازی چت ====================
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
            headers: { 'Authorization': `token ${currentToken}`, 'Content-Type': 'application/json' },
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

// ==================== آیکون‌های SVG ====================
const SVG_PLAY = `
  <svg class="play-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/>
  </svg>
  <svg class="pause-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="6" y="5" width="4" height="14" rx="1.2"/>
    <rect x="14" y="5" width="4" height="14" rx="1.2"/>
  </svg>
`;

const SVG_EMPTY_CHAT = `
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3a3a45" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
  </svg>
`;

// ==================== نمایش پیام‌ها ====================
function renderMessages() {
    const container = document.getElementById('messages');
    if (!container) return;
    container.innerHTML = '';

    if (!messages.length) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">${SVG_EMPTY_CHAT}</div>
            <h3 class="text-sm font-semibold text-[#e8e8ed]">شروع گفتگو</h3>
            <p class="text-xs text-[#6b6b7a] mt-1.5 max-w-[220px] leading-relaxed">اولین پیام را ارسال کنید و گفتگو را آغاز کنید</p>
          </div>`;
        return;
    }

    let lastSender = null;
    let lastTime = 0;

    messages.forEach((msg, index) => {
        const isOwn = msg.sender === currentUsername;
        const isGrouped = msg.sender === lastSender && (msg.time - lastTime) < 5 * 60 * 1000;

        const div = document.createElement('div');
        div.className = `message ${isOwn ? 'own' : ''} ${isGrouped ? 'grouped' : ''}`;

        const avatarUrl = msg.avatar || `https://github.com/${msg.sender}.png`;
        const timeStr = formatTime(msg.time);

        let contentHtml = '';

        if (msg.type === 'voice' && msg.data) {
            contentHtml = `
              <div class="voice-message" data-audio="${msg.data}">
                <button class="voice-play-btn" aria-label="پخش">
                  ${SVG_PLAY}
                </button>
                <div class="voice-wave">
                  <span></span><span></span><span></span><span></span>
                  <span></span><span></span><span></span><span></span>
                  <span></span><span></span><span></span><span></span>
                </div>
                <span class="voice-time">${msg.duration || 0}s</span>
              </div>`;
        } else {
            contentHtml = `<div class="bubble">${escapeHtml(msg.text || '')}</div>`;
        }

        const nameHtml = !isOwn && !isGrouped
            ? `<span class="msg-name">${escapeHtml(msg.sender || 'User')}</span>`
            : '';

        div.innerHTML = `
          <img src="${avatarUrl}" class="msg-avatar" alt="" loading="lazy">
          <div class="msg-content">
            ${nameHtml}
            ${contentHtml}
            <span class="msg-time">${timeStr}</span>
          </div>
        `;

        container.appendChild(div);
        lastSender = msg.sender;
        lastTime = msg.time;
    });

    // انیمیشن ورود
    if (window.Motion && typeof window.Motion.animate === 'function') {
        const { animate, stagger } = window.Motion;
        try {
            animate('#messages .message',
                { opacity: [0, 1], y: [10, 0] },
                { duration: 0.35, delay: stagger(0.025), easing: [0.16, 1, 0.3, 1] }
            );
        } catch (e) {
            document.querySelectorAll('#messages .message').forEach(el => {
                el.style.opacity = 1;
                el.style.transform = 'translateY(0)';
            });
        }
    } else {
        document.querySelectorAll('#messages .message').forEach(el => {
            el.style.opacity = 1;
            el.style.transform = 'translateY(0)';
        });
    }

    // اسکرول
    requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
    });

    if (window.VoiceManager) VoiceManager.attachVoicePlayers();
}

// ==================== پنل اموجی ====================
const emojis = [
    '😀','😂','😍','😎','😢','😡','👍','👎','❤️','🔥',
    '🎉','💔','🤣','🥲','😊','😇','🙂','😴','🤔','😉',
    '🌟','⭐','🎈','✨','💯','💤','🕒','📌','📎','💬'
];
const stickers = ['😍','👍','🎉','💔','🤣','🔥','😎','❤️','🥲','⭐'];

const emojiPicker = document.getElementById('emojiPicker');
const pickerContent = document.getElementById('pickerContent');

document.getElementById('emojiBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle('hidden');
    if (!emojiPicker.classList.contains('hidden')) renderPicker(pickerTab);
});

document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.remove('active', 'bg-[#c8ff4d]/10', 'text-[#c8ff4d]');
            t.classList.add('text-[#6b6b7a]');
        });
        e.target.classList.add('active', 'bg-[#c8ff4d]/10', 'text-[#c8ff4d]');
        e.target.classList.remove('text-[#6b6b7a]');
        pickerTab = e.target.dataset.tab;
        renderPicker(pickerTab);
    });
});

function renderPicker(type) {
    if (!pickerContent) return;
    pickerContent.innerHTML = '';
    const list = type === 'stickers' ? stickers : emojis;
    list.forEach(emoji => {
        const span = document.createElement('span');
        span.className = 'emoji-item';
        span.textContent = emoji;
        span.addEventListener('click', () => {
            insertEmoji(emoji);
            emojiPicker.classList.add('hidden');
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
        emojiPicker.classList.add('hidden');
    }
});

// ==================== ارسال ====================
document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('msgInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// ==================== شروع ====================
switchScreen('password');
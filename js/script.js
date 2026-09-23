// ==================== تنظیمات ====================
const REPO_OWNER = 'aminzebarjad';
const REPO_NAME = 'chatter';
const ADMIN_USERNAME = 'aminzebarjad';
const API_FILE_PATH = 'chat.json';
const PASSWORD_FILE_PATH = 'password.json';

// محدودیت‌ها
const MAX_VOICE_DURATION = 45;
const VOICE_BITRATE = 24000;
const MAX_CHAT_SIZE = 700 * 1024;      // حداکثر حجم chat.json (~۷۰۰KB)
const MAX_VOICE_SIZE = 80 * 1024;      // حداکثر حجم هر پیام صوتی

const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${API_FILE_PATH}`;
const PASSWORD_RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${PASSWORD_FILE_PATH}`;
const PASSWORD_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${PASSWORD_FILE_PATH}`;

// ==================== UTF-8 / Base64 (تضمینی) ====================
// ✅ حلقه ساده، بدون apply، بدون spread، بدون آرگومان‌های زیاد
function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    const len = bytes.length;
    let binary = '';
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToUtf8(base64) {
    const clean = base64.replace(/\s/g, '');
    const binString = atob(clean);
    const len = binString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binString.charCodeAt(i);
    }
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

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

// ==================== fetch با تایم‌اوت ====================
async function fetchWithTimeout(url, options = {}, timeout = 3000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return response;
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
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
        const res = await fetchWithTimeout(PASSWORD_RAW_URL, {}, 3000);
        if (res.ok) {
            const data = await res.json();
            if (data && data.password) {
                console.log('[Chatter] Password loaded from raw URL');
                return String(data.password);
            }
        }
    } catch (e) {
        console.warn('[Chatter] Raw password fetch failed:', e.message);
    }

    try {
        const res = await fetchWithTimeout(PASSWORD_API_URL, {
            headers: { 'Accept': 'application/vnd.github.v3+json' }
        }, 3000);
        if (res.ok) {
            const data = await res.json();
            if (data && data.content) {
                const decoded = JSON.parse(base64ToUtf8(data.content));
                if (decoded && decoded.password) {
                    console.log('[Chatter] Password loaded from API fallback');
                    return String(decoded.password);
                }
            }
        }
    } catch (e) {
        console.warn('[Chatter] API password fetch failed:', e.message);
    }

    console.warn('[Chatter] Using default password: 1234');
    return '1234';
}

// ==================== مودال confirm ====================
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

// ==================== مرحله ۱: رمز عبور ====================
document.getElementById('checkPasswordBtn').addEventListener('click', handlePassword);
document.getElementById('roomPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handlePassword();
});

async function handlePassword() {
    const btn = document.getElementById('checkPasswordBtn');
    const errorEl = document.getElementById('passwordError');
    const pass = document.getElementById('roomPassword').value;

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '...';
    errorEl.textContent = '';

    try {
        const currentPass = await getCurrentChatPassword();
        if (pass === currentPass) {
            errorEl.textContent = '';
            await attemptAutoLogin();
        } else {
            errorEl.textContent = '❌ رمز اشتباه است';
        }
    } catch (e) {
        errorEl.textContent = '⚠️ خطا در بررسی رمز';
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function attemptAutoLogin() {
    const savedToken = getSavedToken();
    if (!savedToken) { switchScreen('token'); return; }
    try {
        const res = await fetchWithTimeout('https://api.github.com/user', {
            headers: { 'Authorization': `token ${savedToken}` }
        }, 5000);

        if (!res.ok) { clearToken(); switchScreen('token'); return; }
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
    const btn = document.getElementById('connectBtn');
    const token = tokenInput.value.trim();

    if (!token) { errorEl.textContent = 'توکن را وارد کن'; return; }

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '...';
    errorEl.textContent = 'در حال بررسی...';

    try {
        const res = await fetchWithTimeout('https://api.github.com/user', {
            headers: { 'Authorization': `token ${token}` }
        }, 6000);

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
        errorEl.textContent = '';
        switchScreen('chat');
        startChat();
    } catch (e) {
        errorEl.textContent = '⚠️ مشکل در اتصال یا تایم‌اوت';
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
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
        const res = await fetchWithTimeout(API_URL, {
            headers: { 'Authorization': `token ${currentToken}` }
        }, 5000);

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
        console.warn('[Chatter] Load messages failed:', e.message);
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
        const getRes = await fetchWithTimeout(API_URL, {
            headers: { 'Authorization': `token ${currentToken}` }
        }, 5000);
        if (!getRes.ok) throw new Error('دریافت فایل ناموفق');
        const { sha } = await getRes.json();

        const putRes = await fetchWithTimeout(API_URL, {
            method: 'PUT',
            headers: { 'Authorization': `token ${currentToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `پیام از ${currentUsername}`,
                content: utf8ToBase64(JSON.stringify(updated)),
                sha: sha
            })
        }, 8000);

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

// ==================== ارسال پیام صوتی (محافظت کامل) ====================
async function sendVoiceMessage(base64Audio, duration) {
    if (!currentToken || !currentUsername) {
        alert('لطفاً ابتدا وارد شوید');
        return false;
    }

    // حجم خود صدا
    const voiceSize = base64Audio.length;
    console.log('[Chatter] Voice size:', formatBytes(voiceSize));

    if (voiceSize > MAX_VOICE_SIZE) {
        alert(`⚠️ حجم صدا زیاد است (${formatBytes(voiceSize)}).\nلطفاً صدای کوتاه‌تری ضبط کنید (حداکثر ~۳۰ ثانیه).`);
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

    // ✅ پیش‌بینی حجم نهایی chat.json قبل از کدگذاری
    let predictedSize = 0;
    try {
        predictedSize = JSON.stringify(updated).length;
    } catch (e) {
        console.error('[Chatter] Failed to stringify messages:', e);
        alert('⚠️ خطا در آماده‌سازی پیام');
        return false;
    }

    console.log('[Chatter] Predicted chat.json size:', formatBytes(predictedSize));

    if (predictedSize > MAX_CHAT_SIZE) {
        alert(`⚠️ فایل چت پر شده است (${formatBytes(predictedSize)}).\n\n` +
              `راه‌حل:\n` +
              `• پیام‌های صوتی قدیمی را پاک کنید\n` +
              `• یا از دکمه‌ی "پاک کردن چت" در بالا استفاده کنید`);
        return false;
    }

    try {
        const getRes = await fetchWithTimeout(API_URL, {
            headers: { 'Authorization': `token ${currentToken}` }
        }, 5000);
        if (!getRes.ok) throw new Error('دریافت فایل ناموفق');
        const { sha } = await getRes.json();

        // ✅ کدگذاری امن (utf8ToBase64 با for loop ساده)
        let encoded;
        try {
            encoded = utf8ToBase64(JSON.stringify(updated));
        } catch (e) {
            console.error('[Chatter] Base64 encoding failed:', e);
            alert('⚠️ حجم چت خیلی زیاد است. لطفاً چت را پاک کنید.');
            return false;
        }

        const putRes = await fetchWithTimeout(API_URL, {
            method: 'PUT',
            headers: { 'Authorization': `token ${currentToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `پیام صوتی از ${currentUsername}`,
                content: encoded,
                sha: sha
            })
        }, 25000);

        if (!putRes.ok) {
            const err = await putRes.json();
            alert('خطا در ارسال پیام صوتی: ' + (err.message || 'نامشخص'));
            return false;
        }
        messages = updated;
        justSent = true;
        renderMessages();
        return true;
    } catch (e) {
        console.error('[Chatter] Voice send error:', e);
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

    messages.forEach((msg) => {
        const isOwn = msg.sender === currentUsername;
        const isGrouped = msg.sender === lastSender && (msg.time - lastTime) < 5 * 60 * 1000;

        const div = document.createElement('div');
        div.className = `message ${isOwn ? 'own' : ''} ${isGrouped ? 'grouped' : ''}`;

        const avatarUrl = msg.avatar || `https://github.com/${msg.sender}.png`;
        const timeStr = formatTime(msg.time);

        let contentHtml = '';

        if (msg.type === 'voice' && msg.data) {
            const dur = Number(msg.duration) || 0;
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
                <span class="voice-time">${dur}s</span>
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
console.log('[Chatter] Script initialized');
switchScreen('password');
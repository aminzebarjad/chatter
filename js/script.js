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
    } catch (e) {
        // silent
    }
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
    document.getElementById('guideBox').classList.toggle('hidden');
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
    if (e.target === modal || e.target.hasAttribute('data-close-modal')) {
        closeModalFunc();
    }
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
        errorEl.textContent = '';
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

    // اتصال ماژول صدا به تابع ارسال پیام
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
            if (window.VoiceManager) {
                VoiceManager.attachVoicePlayers();
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

// ==================== نمایش پیام‌ها ====================
function renderMessages() {
    const container = document.getElementById('messages');
    if (!container) return;
    container.innerHTML = '';

    if (!messages.length) {
        container.innerHTML = `
          <div class="flex flex-col items-center justify-center h-full text-center select-none">
            <div class="w-14 h-14 rounded-2xl bg-[#16161c] border border-[#1e1e26] flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3a3a45" stroke-width="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <h3 class="text-sm font-medium text-[#6b6b7a]">شروع گفتگو</h3>
            <p class="text-xs text-[#3a3a45] mt-1">اولین پیام را ارسال کنید</p>
          </div>`;
        return;
    }

    messages.forEach((msg, index) => {
        const isOwn = msg.sender === currentUsername;
        const div = document.createElement('div');
        div.className = `message flex gap-2.5 ${isOwn ? 'own flex-row-reverse' : ''}`;
        div.style.animationDelay = `${Math.min(index * 25, 400)}ms`;

        const avatarUrl = msg.avatar || `https://github.com/${msg.sender}.png`;
        const timeStr = formatTime(msg.time);

        let contentHtml = '';
        if (msg.type === 'voice' && msg.data) {
            const btnBg = isOwn ? 'bg-[#050507]/15' : 'bg-[#c8ff4d]/15';
            const iconColor = isOwn ? '#050507' : '#c8ff4d';
            contentHtml = `
              <div class="voice-message flex items-center gap-2.5 px-3.5 py-2.5 rounded-[18px] ${isOwn ? 'bg-[#c8ff4d] text-[#050507]' : 'bg-[#16161c] border border-[#1e1e26] text-[#e8e8ed]'}" data-audio="${msg.data}">
                <button class="voice-play-btn w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${btnBg} text-[10px]" style="color: ${iconColor}">▶️</button>
                <div class="voice-wave flex items-center gap-[3px] h-4"><span></span><span></span><span></span><span></span></div>
                <span class="text-[11px] opacity-60 font-medium">${msg.duration || 0}s</span>
              </div>`;
        } else {
            contentHtml = `
              <div class="bubble px-3.5 py-2.5 text-sm leading-relaxed max-w-[70vw] md:max-w-[420px] break-words">
                ${escapeHtml(msg.text || '')}
              </div>`;
        }

        div.innerHTML = `
          <img src="${avatarUrl}" class="w-7 h-7 rounded-full shrink-0 mt-0.5 bg-[#16161c] object-cover" alt="">
          <div class="flex flex-col ${isOwn ? 'items-end' : 'items-start'} min-w-0">
            <span class="text-[10px] text-[#6b6b7a] mb-1 px-1">${escapeHtml(msg.sender || 'User')}</span>
            ${contentHtml}
            <span class="text-[10px] text-[#3a3a45] mt-1 px-1">${timeStr}</span>
          </div>
        `;

        container.appendChild(div);
    });

    // انیمیشن ورود پیام‌ها با Motion One
    if (window.Motion && typeof window.Motion.animate === 'function') {
        const { animate, stagger } = window.Motion;
        try {
            animate('#messages .message',
                { opacity: [0, 1], y: [12, 0] },
                { duration: 0.4, delay: stagger(0.03), easing: [0.16, 1, 0.3, 1] }
            );
        } catch (e) {
            // fallback
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

    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });

    if (window.VoiceManager) {
        VoiceManager.attachVoicePlayers();
    }
}

// ==================== پنل اموجی و استیکر ====================
const emojis = [
    '😀','😂','😍','😎','😢','😡','👍','👎','❤️','🔥',
    '🎉','💔','🤣','🥲','😊','😇','🙂','😴','🤔','😉',
    '🌟','⭐','🎈','✨','💯','💤','🕒','📌','📎','💬'
];
const stickers = [
    '😍','👍','🎉','💔','🤣','🔥','😎','❤️','🥲','⭐'
];

const emojiPicker = document.getElementById('emojiPicker');
const pickerContent = document.getElementById('pickerContent');

document.getElementById('emojiBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle('hidden');
    if (!emojiPicker.classList.contains('hidden')) {
        renderPicker(pickerTab);
    }
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

// ==================== دکمه ارسال و Enter ====================
document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('msgInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// ==================== شروع برنامه ====================
switchScreen('password');
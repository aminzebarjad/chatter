// ========== تنظیمات ==========
const REPO_OWNER = 'aminzebarjad';        // ← نام کاربری صاحب مخزن
const REPO_NAME = 'chatter';              // ← اسم مخزن
const ADMIN_USERNAME = 'aminzebarjad';    // ← ادمین (فقط این شخص دکمه پاک کردن رو میبینه)
const API_FILE_PATH = 'chat.json';
const ROOM_PASSWORD = '1234';

// آدرس‌ها
const RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${API_FILE_PATH}`;
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${API_FILE_PATH}`;

// وضعیت برنامه
let currentToken = '';
let currentUsername = '';
let currentAvatar = '';  // آواتار کاربر جاری
let messages = [];
let refreshInterval = null;

// ========== المان‌ها ==========
const passwordScreen = document.getElementById('passwordScreen');
const tokenScreen = document.getElementById('tokenScreen');
const chatScreen = document.getElementById('chatScreen');

// ========== ابزار صدا ==========
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

// ========== localStorage ==========
function saveToken(token) {
    localStorage.setItem('chatter_github_token', token);
}
function getSavedToken() {
    return localStorage.getItem('chatter_github_token');
}
function clearToken() {
    localStorage.removeItem('chatter_github_token');
}

// ========== راهنما ==========
document.getElementById('showGuideBtn').addEventListener('click', () => {
    document.getElementById('guideBox').classList.toggle('visible');
});

// ========== دکمه‌های خروج و پاک کردن ==========
document.getElementById('logoutBtn').addEventListener('click', () => {
    clearToken();
    currentToken = '';
    currentUsername = '';
    currentAvatar = '';
    messages = [];
    if (refreshInterval) clearInterval(refreshInterval);
    switchScreen('password');
});
document.getElementById('clearChatBtn').addEventListener('click', async () => {
    if (currentUsername !== ADMIN_USERNAME) return;
    if (!confirm('آیا از پاک کردن تمام پیام‌ها مطمئنی؟')) return;
    await clearAllMessages();
});

// ========== مرحله ۱: رمز ==========
document.getElementById('checkPasswordBtn').addEventListener('click', handlePassword);
document.getElementById('roomPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handlePassword();
});

function handlePassword() {
    const pass = document.getElementById('roomPassword').value;
    const errorEl = document.getElementById('passwordError');
    if (pass === ROOM_PASSWORD) {
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
    // تلاش برای ورود خودکار
    const errorEl = document.getElementById('tokenError');
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

// ========== مرحله ۲: توکن ==========
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

// ========== تعویض صفحات ==========
function switchScreen(name) {
    passwordScreen.classList.remove('active');
    tokenScreen.classList.remove('active');
    chatScreen.classList.remove('active');
    if (name === 'password') passwordScreen.classList.add('active');
    else if (name === 'token') tokenScreen.classList.add('active');
    else if (name === 'chat') chatScreen.classList.add('active');
}

// ========== شروع چت ==========
function startChat() {
    document.getElementById('currentUser').innerHTML = `
        <img src="${currentAvatar}" alt="avatar"> ${currentUsername}
    `;
    // دکمه پاک کردن فقط برای ادمین
    const clearBtn = document.getElementById('clearChatBtn');
    if (currentUsername === ADMIN_USERNAME) {
        clearBtn.classList.remove('hidden');
    } else {
        clearBtn.classList.add('hidden');
    }

    loadMessages();
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(loadMessages, 4000);
}

// ========== بارگذاری پیام‌ها ==========
async function loadMessages() {
    try {
        const url = `${RAW_URL}?t=${Date.now()}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const newJson = JSON.stringify(data);
        if (newJson !== JSON.stringify(messages)) {
            const isFirstLoad = messages.length === 0;
            messages = data;
            renderMessages();
            if (!isFirstLoad) playNotificationSound(); // فقط در به‌روزرسانی‌ها
        }
    } catch (e) {
        console.warn('بارگذاری پیام‌ها با خطا مواجه شد', e);
    }
}

// ========== ارسال پیام ==========
async function sendMessage() {
    const input = document.getElementById('msgInput');
    const text = input.value.trim();
    if (!text || !currentToken || !currentUsername) return;

    const newMsg = {
        sender: currentUsername,
        text: text,
        time: Date.now(),
        avatar: currentAvatar   // ذخیره آواتار در پیام
    };

    const updated = [...messages, newMsg];
    try {
        // گرفتن sha
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
                content: btoa(unescape(encodeURIComponent(JSON.stringify(updated, null, 2)))),
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
        renderMessages();
        // فوکوس دوباره برای ارسال سریع
        input.focus();
    } catch (e) {
        alert('مشکل در ارسال پیام');
    }
}

// ========== پاک کردن چت (ادمین) ==========
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
                content: btoa('[]'),
                sha: sha
            })
        });

        if (!putRes.ok) {
            const err = await putRes.json();
            alert('خطا در پاک‌سازی: ' + err.message);
            return;
        }
        messages = [];
        renderMessages();
    } catch (e) {
        alert('مشکل در پاک‌سازی چت');
    }
}

// ========== نمایش پیام‌ها ==========
function renderMessages() {
    const container = document.getElementById('messages');
    container.innerHTML = '';
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.sender === currentUsername ? 'own' : ''}`;
        const avatarUrl = msg.avatar || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png';
        const timeStr = formatTime(msg.time);
        div.innerHTML = `
            <div class="msg-header">
                <img class="sender-avatar" src="${avatarUrl}" alt="">
                <span class="sender-name">${escapeHtml(msg.sender)}</span>
            </div>
            <span class="text">${escapeHtml(msg.text)}</span>
            <div class="time">${timeStr}</div>
        `;
        container.appendChild(div);
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

// ========== اموجی و استیکر ==========
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

// بستن پنل با کلیک بیرون
document.addEventListener('click', (e) => {
    if (!emojiPicker.contains(e.target) && e.target !== document.getElementById('emojiBtn')) {
        emojiPicker.classList.remove('visible');
    }
});

// ========== ارسال ==========
document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('msgInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// شروع با صفحه رمز
switchScreen('password');

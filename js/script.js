// ========== اطلاعات مخزن (تنظیم کن) ==========
const REPO_OWNER = 'AminZebarjad';        // ← نام کاربری گیت‌هاب خودت (صاحب مخزن)
const REPO_NAME = 'chatter';          // ← اسم مخزن
const API_FILE_PATH = 'chat.json';
const ROOM_PASSWORD = '1234';

// URLهای مورد نیاز
const RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${API_FILE_PATH}`;
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${API_FILE_PATH}`;

// وضعیت برنامه
let currentToken = '';
let currentUsername = '';
let messages = [];
let refreshInterval = null;

// ========== چرخش صفحات ==========
const passwordScreen = document.getElementById('passwordScreen');
const tokenScreen = document.getElementById('tokenScreen');
const chatScreen = document.getElementById('chatScreen');

// ========== راهنما ==========
document.getElementById('showGuideBtn').addEventListener('click', () => {
    document.getElementById('guideBox').classList.toggle('visible');
});

// ========== مرحله ۱: بررسی رمز ==========
document.getElementById('checkPasswordBtn').addEventListener('click', checkPassword);
document.getElementById('roomPassword').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkPassword();
});

function checkPassword() {
    const pass = document.getElementById('roomPassword').value;
    const errorEl = document.getElementById('passwordError');
    if (pass === ROOM_PASSWORD) {
        errorEl.textContent = '';
        switchScreen('token');
    } else {
        errorEl.textContent = '❌ رمز اشتباه است';
    }
}

// ========== مرحله ۲: اتصال توکن ==========
document.getElementById('connectBtn').addEventListener('click', connectToken);
document.getElementById('tokenInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') connectToken();
});

async function connectToken() {
    const tokenInput = document.getElementById('tokenInput');
    const errorEl = document.getElementById('tokenError');
    const token = tokenInput.value.trim();
    if (!token) {
        errorEl.textContent = 'توکن را وارد کن';
        return;
    }

    errorEl.textContent = 'در حال بررسی...';
    try {
        const response = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${token}` }
        });

        if (!response.ok) {
            errorEl.textContent = '❌ توکن نامعتبر یا دسترسی کافی ندارد';
            return;
        }

        const userData = await response.json();
        currentUsername = userData.login;
        currentToken = token;

        // پاک کردن فیلد توکن از حافظه بصری
        tokenInput.value = '';
        switchScreen('chat');
        startChat();
    } catch (err) {
        errorEl.textContent = '⚠️ مشکل در اتصال به گیت‌هاب. اینترنت یا توکن را بررسی کن';
        console.error(err);
    }
}

function switchScreen(screenName) {
    passwordScreen.classList.remove('active');
    tokenScreen.classList.remove('active');
    chatScreen.classList.remove('active');

    if (screenName === 'password') passwordScreen.classList.add('active');
    else if (screenName === 'token') tokenScreen.classList.add('active');
    else if (screenName === 'chat') chatScreen.classList.add('active');
}

// ========== مرحله ۳: چت ==========
function startChat() {
    document.getElementById('currentUser').textContent = `👤 ${currentUsername}`;
    loadMessages();
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(loadMessages, 4000);
}

async function loadMessages() {
    try {
        // از raw برای دور زدن کش قوی گیت‌هاب
        const url = `${RAW_URL}?t=${Date.now()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('خطا در بارگذاری پیام‌ها');
        const data = await res.json();
        if (JSON.stringify(data) !== JSON.stringify(messages)) {
            messages = data;
            renderMessages();
        }
    } catch (err) {
        console.warn('بارگذاری پیام‌ها موفق نبود', err);
    }
}

async function sendMessage() {
    const input = document.getElementById('msgInput');
    const text = input.value.trim();
    if (!text || !currentToken || !currentUsername) return;

    const newMsg = {
        sender: currentUsername,
        text: text,
        time: Date.now()
    };

    const updatedMessages = [...messages, newMsg];

    try {
        // گرفتن آخرین sha
        const latestRes = await fetch(API_URL, {
            headers: { 'Authorization': `token ${currentToken}` }
        });
        const { sha } = await latestRes.json();

        // آپدیت فایل
        const putRes = await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${currentToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `پیام جدید از ${currentUsername}`,
                content: btoa(unescape(encodeURIComponent(JSON.stringify(updatedMessages, null, 2)))),
                sha: sha
            })
        });

        if (!putRes.ok) {
            const err = await putRes.json();
            alert('خطا در ارسال: ' + err.message);
            return;
        }

        // موفقیت
        input.value = '';
        messages = updatedMessages;
        renderMessages();
        // پاک کردن فوری کش مرورگر برای دریافت نسخه بعدی
    } catch (err) {
        alert('مشکل در ارسال پیام');
        console.error(err);
    }
}

function renderMessages() {
    const container = document.getElementById('messages');
    container.innerHTML = '';
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.sender === currentUsername ? 'own' : ''}`;
        div.innerHTML = `
            <span class="sender">${escapeHtml(msg.sender)}</span>
            <span class="text">${escapeHtml(msg.text)}</span>
        `;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// اتصال دکمه ارسال و Enter
document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('msgInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// شروع با صفحه رمز
switchScreen('password');

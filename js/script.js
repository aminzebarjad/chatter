// ==================== تنظیمات ====================
const REPO_OWNER = 'aminzebarjad';        // نام کاربری گیت‌هاب شما
const REPO_NAME = 'chatter';              // نام مخزن
const ADMIN_USERNAME = 'aminzebarjad';    // ادمین (فقط این شخص دکمهٔ پاک‌کردن و تغییر رمز را می‌بیند)
const API_FILE_PATH = 'chat.json';
const PASSWORD_FILE_PATH = 'password.json'; // فایل رمز چت‌روم

// آدرس‌ها
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

// ==================== رمز چت‌روم (دریافت از فایل password.json) ====================
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

// ==================== مودال اختصاصی confirm (جایگزین confirm پیش‌فرض) ====================
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
            // همچنین با کلیک روی backdrop نباید بسته شود (اختیاری)
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

// ==================== خروج (با confirm اختصاصی) ====================
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

// ==================== پاک کردن چت (با confirm اختصاصی) ====================
document.getElementById('clearChatBtn').addEventListener('click', async () => {
    if (currentUsername !== ADMIN_USERNAME) return;
    const confirmed = await customConfirm('آیا از پاک کردن تمام پیام‌ها مطمئنی؟');
    if (confirmed) {
        await clearAllMessages();
    }
});

// ==================== تغییر رمز (مودال) ====================
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

// ==================== ارسال پیام ====================
async function sendMessage() {
    const input = document.getElementById('msgInput');
    const text = input.value.trim();
    if (!text || !currentToken || !currentUsername) return;

    const newMsg = {
        sender: currentUsername,
        text: text,
        time: Date.now(),
        avatar: currentAvatar
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

// ==================== پاک‌سازی کامل چت (ادمین) ====================
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
    container.innerHTML = '';
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `message ${msg.sender === currentUsername ? 'own' : ''}`;
        let avatarUrl = msg.avatar;
        if (!avatarUrl) {
            avatarUrl = `https://github.com/${msg.sender}.png`;
        }
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

// ==================== پنل اموجی و استیکر ====================
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

// ==================== دکمهٔ ارسال و Enter ====================
document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('msgInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// ==================== تولتیپ اختصاصی ====================
function initTooltips() {
    const tooltipTriggerElements = document.querySelectorAll('[data-tooltip]');
    let currentTooltip = null;

    function createTooltip(text) {
        const tooltip = document.createElement('div');
        tooltip.className = 'custom-tooltip';
        tooltip.textContent = text;
        document.body.appendChild(tooltip);
        return tooltip;
    }

    function positionTooltip(tooltip, trigger) {
        const rect = trigger.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();

        let top = rect.top - tooltipRect.height - 6;
        let left = rect.left + rect.width / 2 - tooltipRect.width / 2;

        if (top < 10) {
            top = rect.bottom + 6;
        }
        if (left < 10) left = 10;
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
    }

    tooltipTriggerElements.forEach(trigger => {
        trigger.addEventListener('mouseenter', () => {
            const text = trigger.getAttribute('data-tooltip');
            if (!text) return;

            if (currentTooltip) {
                currentTooltip.remove();
                currentTooltip = null;
            }

            currentTooltip = createTooltip(text);
            positionTooltip(currentTooltip, trigger);
            requestAnimationFrame(() => {
                currentTooltip.classList.add('visible');
            });
        });

        trigger.addEventListener('mouseleave', () => {
            if (currentTooltip) {
                currentTooltip.classList.remove('visible');
                currentTooltip.addEventListener('transitionend', function handler() {
                    if (currentTooltip && !currentTooltip.classList.contains('visible')) {
                        currentTooltip.remove();
                        currentTooltip = null;
                    }
                }, { once: true });
                setTimeout(() => {
                    if (currentTooltip && !currentTooltip.classList.contains('visible')) {
                        currentTooltip.remove();
                        currentTooltip = null;
                    }
                }, 300);
            }
        });
    });

    document.addEventListener('click', () => {
        if (currentTooltip) {
            currentTooltip.classList.remove('visible');
            setTimeout(() => {
                if (currentTooltip) {
                    currentTooltip.remove();
                    currentTooltip = null;
                }
            }, 300);
        }
    });
}

// ==================== شروع برنامه ====================
document.addEventListener('DOMContentLoaded', initTooltips);
switchScreen('password');

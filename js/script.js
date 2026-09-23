// ==================== نمایش پیام‌ها (بازنویسی‌شده) ====================
function renderMessages() {
    const container = document.getElementById('messages');
    if (!container) return;
    container.innerHTML = '';

    if (!messages.length) {
        container.innerHTML = `
          <div class="flex flex-col items-center justify-center h-full text-center">
            <div class="w-14 h-14 rounded-2xl bg-[#16161c] border border-[#1e1e26] flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3a3a45" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
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
        div.style.animationDelay = `${index * 30}ms`;
        
        const avatarUrl = msg.avatar || `https://github.com/${msg.sender}.png`;
        const timeStr = formatTime(msg.time);
        
        let contentHtml = '';
        if (msg.type === 'voice' && msg.data) {
            contentHtml = `
              <div class="voice-message flex items-center gap-2.5 px-3.5 py-2.5 rounded-[18px] ${isOwn ? 'bg-[#c8ff4d] text-[#050507]' : 'bg-[#16161c] border border-[#1e1e26] text-[#e8e8ed]'}">
                <button class="voice-play-btn w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isOwn ? 'bg-[#050507]/20' : 'bg-[#c8ff4d]/20'}">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="${isOwn ? '#050507' : '#c8ff4d'}"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </button>
                <div class="voice-wave flex items-center gap-0.5 h-4"><span></span><span></span><span></span><span></span></div>
                <span class="text-[11px] opacity-60">${msg.duration || 0}s</span>
              </div>`;
        } else {
            contentHtml = `
              <div class="bubble px-3.5 py-2.5 text-sm leading-relaxed max-w-[70%]">
                ${escapeHtml(msg.text || '')}
              </div>`;
        }
        
        div.innerHTML = `
          <img src="${avatarUrl}" class="w-7 h-7 rounded-full shrink-0 mt-0.5 bg-[#16161c]" alt="">
          <div class="flex flex-col ${isOwn ? 'items-end' : 'items-start'}">
            <span class="text-[10px] text-[#6b6b7a] mb-1 px-1">${escapeHtml(msg.sender || 'User')}</span>
            ${contentHtml}
            <span class="text-[10px] text-[#3a3a45] mt-1 px-1">${timeStr}</span>
          </div>
        `;
        
        container.appendChild(div);
    });
    
    // Animate messages in with Motion One
    if (window.Motion) {
        const { animate, stagger } = window.Motion;
        animate('.message', 
          { opacity: [0, 1], y: [12, 0] },
          { duration: 0.4, delay: stagger(0.03), easing: [0.16, 1, 0.3, 1] }
        );
    }
    
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    
    if (window.voiceManager) {
        VoiceManager.attachVoicePlayers();
    }
}
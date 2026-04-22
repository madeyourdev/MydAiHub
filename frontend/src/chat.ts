import './style.css';
import './sidebar.css';
import './dashboard.css';
import './chat.css';
import { initSidebar } from './sidebar';

document.body.style.opacity = '1';

const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) throw new Error('VITE_API_URL environment variable is required');

interface Message {
  role: 'user' | 'ai';
  content: string;
}

const messages: Message[] = [];
let isLoading = false;

async function loadUser() {
  const res = await fetch(`${API_URL}/users/me`, { credentials: 'include' });
  if (res.status === 401) {
    window.location.href = '/';
    return;
  }
  const user = await res.json();

  const initial = user.username.charAt(0).toUpperCase();
  document.getElementById('userAvatar')!.textContent = initial;
  document.getElementById('userName')!.textContent = user.username;
  document.getElementById('userRole')!.textContent = user.role;
  document.getElementById('creditsCount')!.textContent = user.credits.toLocaleString();

  const roleBadge = document.getElementById('userRole')!;
  roleBadge.className = `user-role role-${user.role.toLowerCase()}`;
}

function renderMessage(msg: Message, isTemp = false) {
  const area = document.getElementById('messagesArea')!;
  const emptyState = document.getElementById('emptyState');
  if (emptyState) emptyState.remove();

  const el = document.createElement('div');
  el.className = `message ${msg.role}`;
  if (isTemp) el.id = 'tempMsg';

  const avatarText = msg.role === 'user' ? 'U' : '✦';
  el.innerHTML = `
    <div class="msg-avatar">${avatarText}</div>
    <div class="msg-bubble${isTemp ? ' loading' : ''}">${escapeHtml(msg.content)}</div>
  `;
  area.appendChild(el);
  area.scrollTop = area.scrollHeight;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendMessage() {
  if (isLoading) return;
  const input = document.getElementById('chatInput') as HTMLTextAreaElement;
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';
  isLoading = true;
  document.getElementById('sendBtn')!.setAttribute('disabled', 'true');

  const userMsg: Message = { role: 'user', content: text };
  messages.push(userMsg);
  renderMessage(userMsg);

  // Temp loading bubble
  renderMessage({ role: 'ai', content: 'Thinking...' }, true);

  try {
    const res = await fetch(`${API_URL}/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        message: text,
        model: (document.getElementById('modelSelect') as HTMLSelectElement).value,
      }),
    });

    const tempEl = document.getElementById('tempMsg');
    if (tempEl) tempEl.remove();

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errMsg = err.message || 'Failed to get response';
      renderMessage({ role: 'ai', content: `Error: ${errMsg}` });
    } else {
      const data = await res.json();
      const aiMsg: Message = { role: 'ai', content: data.reply || data.message || '' };
      messages.push(aiMsg);
      renderMessage(aiMsg);

      // Update credits if returned
      if (data.credits !== undefined) {
        document.getElementById('creditsCount')!.textContent = data.credits.toLocaleString();
      }
    }
  } catch {
    const tempEl = document.getElementById('tempMsg');
    if (tempEl) tempEl.remove();
    renderMessage({ role: 'ai', content: 'Error: Could not reach the server.' });
  } finally {
    isLoading = false;
    document.getElementById('sendBtn')!.removeAttribute('disabled');
    input.focus();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initSidebar('chat');
  loadUser();

  const input = document.getElementById('chatInput') as HTMLTextAreaElement;
  const sendBtn = document.getElementById('sendBtn')!;

  sendBtn.addEventListener('click', sendMessage);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  });

  document.getElementById('newChatBtn')!.addEventListener('click', () => {
    messages.length = 0;
    const area = document.getElementById('messagesArea')!;
    area.innerHTML = `
      <div class="empty-state" id="emptyState">
        <div class="empty-icon">◎</div>
        <h3>Start a conversation</h3>
        <p>Ask anything — MydAIHub AI is ready to help</p>
      </div>
    `;
  });

  document.getElementById('logoutBtn')!.addEventListener('click', async () => {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    window.location.href = '/';
  });
});

import './style.css';
import './sidebar.css';
import './dashboard.css';
import './chat.css';
import { initSidebar } from './sidebar';

document.body.style.opacity = '1';

const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) throw new Error('VITE_API_URL environment variable is required');

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
  messages: { content: string; role: string }[];
}

let currentConversationId: string | null = null;
let isLoading = false;

// ─── User ────────────────────────────────────────────────────────────────────

async function loadUser() {
  const res = await fetch(`${API_URL}/users/me`, { credentials: 'include' });
  if (res.status === 401) { window.location.href = '/'; return; }
  const user = await res.json();

  document.getElementById('userAvatar')!.textContent = user.username.charAt(0).toUpperCase();
  document.getElementById('userName')!.textContent = user.username;
  document.getElementById('creditsCount')!.textContent = user.credits.toLocaleString();
  const roleBadge = document.getElementById('userRole')!;
  roleBadge.textContent = user.role;
  roleBadge.className = `user-role role-${user.role.toLowerCase()}`;

  // Pre-select model from admin's setting — user can still override in-session
  if (user.aiModel) {
    (document.getElementById('modelSelect') as HTMLSelectElement).value = user.aiModel;
  }

  initSidebar('chat', user.role);
}

// ─── Conversations list ───────────────────────────────────────────────────────

async function loadConversations() {
  const res = await fetch(`${API_URL}/chat/conversations`, { credentials: 'include' });
  if (!res.ok) return;
  const convs: ConversationSummary[] = await res.json();
  renderConvList(convs);

  if (convs.length > 0) {
    await selectConversation(convs[0].id);
  }
}

function renderConvList(convs: ConversationSummary[]) {
  const container = document.getElementById('convItems')!;
  if (convs.length === 0) {
    container.innerHTML = `<div class="conv-empty">No conversations yet</div>`;
    return;
  }
  container.innerHTML = convs.map(c => {
    const preview = c.messages[0]?.content ?? 'No messages';
    const title = c.title ?? 'New conversation';
    return `
      <div class="conv-item${c.id === currentConversationId ? ' active' : ''}" data-id="${c.id}">
        <span class="conv-icon">◎</span>
        <div class="conv-meta">
          <span class="conv-name">${escapeHtml(title)}</span>
          <span class="conv-preview">${escapeHtml(preview.slice(0, 40))}${preview.length > 40 ? '…' : ''}</span>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll<HTMLElement>('.conv-item').forEach(el => {
    el.addEventListener('click', () => selectConversation(el.dataset.id!));
  });
}

function setActiveConvItem(id: string) {
  document.querySelectorAll('.conv-item').forEach(el => {
    el.classList.toggle('active', (el as HTMLElement).dataset.id === id);
  });
}

async function selectConversation(id: string) {
  currentConversationId = id;
  setActiveConvItem(id);

  const res = await fetch(`${API_URL}/chat/conversations/${id}/messages`, { credentials: 'include' });
  if (!res.ok) return;
  const msgs: (Message & { id: string })[] = await res.json();

  const area = document.getElementById('messagesArea')!;
  area.innerHTML = '';

  if (msgs.length === 0) {
    showEmptyState();
    return;
  }

  msgs.forEach(m => renderMessage(m));
  area.scrollTop = area.scrollHeight;

  const convItem = document.querySelector<HTMLElement>(`.conv-item[data-id="${id}"] .conv-name`);
  document.getElementById('chatTitle')!.textContent = convItem?.textContent ?? 'Conversation';
}

// ─── Messages ────────────────────────────────────────────────────────────────

function showEmptyState() {
  document.getElementById('messagesArea')!.innerHTML = `
    <div class="empty-state" id="emptyState">
      <div class="empty-icon">◎</div>
      <h3>Start a conversation</h3>
      <p>Ask anything — MydAIHub AI is ready to help</p>
    </div>
  `;
}

function renderMessage(msg: Message, isTemp = false) {
  const area = document.getElementById('messagesArea')!;
  document.getElementById('emptyState')?.remove();

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

// ─── Send ─────────────────────────────────────────────────────────────────────

async function sendMessage() {
  if (isLoading) return;
  const input = document.getElementById('chatInput') as HTMLTextAreaElement;
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';
  isLoading = true;
  document.getElementById('sendBtn')!.setAttribute('disabled', 'true');

  renderMessage({ role: 'user', content: text });
  renderMessage({ role: 'assistant', content: 'Thinking...' }, true);

  try {
    const res = await fetch(`${API_URL}/chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        message: text,
        model: (document.getElementById('modelSelect') as HTMLSelectElement).value,
        conversationId: currentConversationId ?? undefined,
      }),
    });

    document.getElementById('tempMsg')?.remove();

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      renderMessage({ role: 'assistant', content: `Error: ${err.message || 'Failed to get response'}` });
      return;
    }

    const data = await res.json();
    renderMessage({ role: 'assistant', content: data.reply || '' });

    if (data.credits !== undefined) {
      document.getElementById('creditsCount')!.textContent = data.credits.toLocaleString();
    }

    // Update conversation state and list
    const isNew = !currentConversationId;
    currentConversationId = data.conversationId;

    if (isNew) {
      document.getElementById('chatTitle')!.textContent = text.length > 50 ? text.slice(0, 47) + '...' : text;
    }

    const convRes = await fetch(`${API_URL}/chat/conversations`, { credentials: 'include' });
    if (convRes.ok) renderConvList(await convRes.json());
    setActiveConvItem(data.conversationId);

  } catch {
    document.getElementById('tempMsg')?.remove();
    renderMessage({ role: 'assistant', content: 'Error: Could not reach the server.' });
  } finally {
    isLoading = false;
    document.getElementById('sendBtn')!.removeAttribute('disabled');
    input.focus();
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadUser();
  await loadConversations();

  const input = document.getElementById('chatInput') as HTMLTextAreaElement;
  document.getElementById('sendBtn')!.addEventListener('click', sendMessage);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  });

  document.getElementById('newChatBtn')!.addEventListener('click', () => {
    currentConversationId = null;
    showEmptyState();
    document.getElementById('chatTitle')!.textContent = 'New conversation';
    setActiveConvItem('');
    input.focus();
  });

  document.getElementById('logoutBtn')!.addEventListener('click', async () => {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    window.location.href = '/';
  });
});

import './style.css';
import './sidebar.css';
import './dashboard.css';
import './admin.css';
import { initSidebar } from './sidebar';

document.body.style.opacity = '1';

const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) throw new Error('VITE_API_URL environment variable is required');

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  status: string;
  credits: number;
  aiModel: string;
  createdAt: string;
  lastLoginAt: string | null;
}

let allUsers: User[] = [];

async function loadCurrentUser() {
  const res = await fetch(`${API_URL}/users/me`, { credentials: 'include' });
  if (res.status === 401) { window.location.href = '/'; return; }

  const user = await res.json();
  if (user.role !== 'ADMIN') { window.location.href = '/dashboard.html'; return; }

  document.getElementById('userAvatar')!.textContent = user.username.charAt(0).toUpperCase();
  document.getElementById('userName')!.textContent = user.username;
  document.getElementById('creditsCount')!.textContent = user.credits.toLocaleString();
  const roleBadge = document.getElementById('userRole')!;
  roleBadge.textContent = user.role;
  roleBadge.className = `user-role role-${user.role.toLowerCase()}`;

  initSidebar('admin', user.role);
}

async function loadUsers() {
  const res = await fetch(`${API_URL}/admin/users`, { credentials: 'include' });
  if (!res.ok) return;

  allUsers = await res.json();
  renderTable(allUsers);

  document.getElementById('totalUsers')!.textContent = allUsers.length.toString();
  document.getElementById('activeUsers')!.textContent = allUsers.filter(u => u.status === 'ACTIVE').length.toString();
}

function renderTable(users: User[]) {
  const tbody = document.getElementById('usersTableBody')!;

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading">No users found</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div class="user-cell">
          <div class="user-cell-avatar">${u.username.charAt(0).toUpperCase()}</div>
          <div class="user-cell-info">
            <span class="user-cell-name">${escHtml(u.username)}</span>
            <span class="user-cell-email">${escHtml(u.email)}</span>
          </div>
        </div>
      </td>
      <td><span class="badge badge-${u.role.toLowerCase()}">${u.role}</span></td>
      <td><span class="credits-cell">◈ ${u.credits.toLocaleString()}</span></td>
      <td><span class="model-cell">${escHtml(u.aiModel)}</span></td>
      <td><span class="badge badge-${u.status.toLowerCase()}">${u.status}</span></td>
      <td>${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('th-TH') : '—'}</td>
      <td><button class="btn-edit" data-id="${u.id}">Edit</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll<HTMLButtonElement>('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.id!));
  });
}

function escHtml(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function openModal(userId: string) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  (document.getElementById('editUserId') as HTMLInputElement).value = user.id;
  document.getElementById('editUsername')!.textContent = user.username;
  document.getElementById('editEmail')!.textContent = user.email;
  (document.getElementById('editCredits') as HTMLInputElement).value = user.credits.toString();
  (document.getElementById('editRole') as HTMLSelectElement).value = user.role;
  (document.getElementById('editAiModel') as HTMLSelectElement).value = user.aiModel;
  (document.getElementById('editStatus') as HTMLSelectElement).value = user.status;
  document.getElementById('modalTitle')!.textContent = `Edit — ${user.username}`;
  hideModalMessage();
  document.getElementById('modalOverlay')!.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modalOverlay')!.classList.add('hidden');
}

function showModalMessage(text: string, type: 'success' | 'error') {
  const el = document.getElementById('modalMessage')!;
  el.textContent = text;
  el.className = `modal-message ${type}`;
}

function hideModalMessage() {
  document.getElementById('modalMessage')!.className = 'modal-message hidden';
}

async function saveUser() {
  const id = (document.getElementById('editUserId') as HTMLInputElement).value;
  const credits = parseInt((document.getElementById('editCredits') as HTMLInputElement).value);
  const role = (document.getElementById('editRole') as HTMLSelectElement).value;
  const aiModel = (document.getElementById('editAiModel') as HTMLSelectElement).value;
  const status = (document.getElementById('editStatus') as HTMLSelectElement).value;

  if (isNaN(credits) || credits < 0) {
    showModalMessage('Credits must be a valid number ≥ 0', 'error');
    return;
  }

  const btn = document.getElementById('btnSave') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const res = await fetch(`${API_URL}/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ credits, role, aiModel, status }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showModalMessage(err.message || 'Failed to save', 'error');
      return;
    }

    const updated: User = await res.json();
    const idx = allUsers.findIndex(u => u.id === updated.id);
    if (idx !== -1) allUsers[idx] = updated;

    showModalMessage('Saved successfully', 'success');
    renderTable(filterUsers((document.getElementById('searchInput') as HTMLInputElement).value));
    document.getElementById('activeUsers')!.textContent = allUsers.filter(u => u.status === 'ACTIVE').length.toString();

    setTimeout(closeModal, 800);
  } catch {
    showModalMessage('Network error', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
}

function filterUsers(query: string): User[] {
  const q = query.toLowerCase().trim();
  if (!q) return allUsers;
  return allUsers.filter(u =>
    u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  );
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentUser();
  await loadUsers();

  document.getElementById('modalClose')!.addEventListener('click', closeModal);
  document.getElementById('btnCancel')!.addEventListener('click', closeModal);
  document.getElementById('btnSave')!.addEventListener('click', saveUser);

  document.getElementById('modalOverlay')!.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  document.getElementById('searchInput')!.addEventListener('input', (e) => {
    renderTable(filterUsers((e.target as HTMLInputElement).value));
  });

  document.getElementById('logoutBtn')!.addEventListener('click', async () => {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    window.location.href = '/';
  });
});

import './style.css';
import './sidebar.css';
import './dashboard.css';
import { initSidebar } from './sidebar';

document.body.style.opacity = '1';

const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) throw new Error('VITE_API_URL environment variable is required');

async function loadUser() {
  const res = await fetch(`${API_URL}/users/me`, {
    credentials: 'include',
  });

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

  document.getElementById('welcomeName')!.textContent = user.username;

  document.getElementById('statCredits')!.textContent = user.credits.toLocaleString();
  document.getElementById('statRole')!.textContent = user.role;
  document.getElementById('statLastLogin')!.textContent = user.lastLoginAt
    ? new Date(user.lastLoginAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
    : 'First login';

  const roleBadge = document.getElementById('userRole')!;
  roleBadge.className = `user-role role-${user.role.toLowerCase()}`;

  initSidebar('dashboard', user.role);
}

async function logout() {
  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', () => {
  loadUser();
  document.getElementById('logoutBtn')!.addEventListener('click', logout);
});

import './style.css';
import './sidebar.css';
import './dashboard.css';
import './credits.css';
import { initSidebar } from './sidebar';

document.body.style.opacity = '1';

const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) throw new Error('VITE_API_URL environment variable is required');

const PACKAGES = [
  {
    credits: 100,
    price: 29,
    desc: 'เหมาะสำหรับทดลองใช้',
    icon: '◈',
  },
  {
    credits: 500,
    price: 129,
    desc: 'เหมาะสำหรับผู้ใช้ทั่วไป',
    icon: '◈',
    popular: true,
  },
  {
    credits: 1000,
    price: 239,
    desc: 'ประหยัดสุด สำหรับผู้ใช้งานหนัก',
    icon: '◈',
  },
  {
    credits: 5000,
    price: 999,
    desc: 'แพ็กเกจองค์กร',
    icon: '◈',
  },
];

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
  document.getElementById('balanceCredits')!.textContent = user.credits.toLocaleString();

  const roleBadge = document.getElementById('userRole')!;
  roleBadge.className = `user-role role-${user.role.toLowerCase()}`;

  initSidebar('credits', user.role);
}

function renderPackages() {
  const grid = document.getElementById('packagesGrid')!;
  grid.innerHTML = PACKAGES.map((pkg) => `
    <div class="pkg-card${pkg.popular ? ' popular' : ''}">
      ${pkg.popular ? '<span class="pkg-badge">Most Popular</span>' : ''}
      <div class="pkg-icon">${pkg.icon}</div>
      <div class="pkg-credits">${pkg.credits.toLocaleString()}<span>credits</span></div>
      <div class="pkg-desc">${pkg.desc}</div>
      <div class="pkg-price">฿${pkg.price.toLocaleString()} <small>THB</small></div>
      <button class="pkg-buy-btn" data-credits="${pkg.credits}" data-price="${pkg.price}">
        Purchase
      </button>
    </div>
  `).join('');

  grid.querySelectorAll<HTMLButtonElement>('.pkg-buy-btn').forEach((btn) => {
    btn.addEventListener('click', () => handlePurchase(
      Number(btn.dataset.credits),
      Number(btn.dataset.price),
    ));
  });
}

async function handlePurchase(credits: number, price: number) {
  showToast(`Payment integration coming soon — Package: ${credits.toLocaleString()} credits (฿${price})`);
}

function showToast(msg: string) {
  const toast = document.getElementById('toastMsg')!;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 4000);
}

document.addEventListener('DOMContentLoaded', () => {
  loadUser();
  renderPackages();

  document.getElementById('logoutBtn')!.addEventListener('click', async () => {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    window.location.href = '/';
  });
});

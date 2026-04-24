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

let pollInterval: ReturnType<typeof setInterval> | null = null;
let countdownInterval: ReturnType<typeof setInterval> | null = null;

async function handlePurchase(credits: number, price: number) {
  const btn = document.querySelector<HTMLButtonElement>(`.pkg-buy-btn[data-credits="${credits}"]`)!;
  btn.disabled = true;
  btn.textContent = 'Loading...';

  try {
    const res = await fetch(`${API_URL}/payments/charge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ credits }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.message || 'Failed to create payment');
      return;
    }

    const data = await res.json();
    openQrModal(data.chargeId, data.qrUrl, credits, price);
  } catch {
    showToast('Could not reach the server');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Purchase';
  }
}

function openQrModal(chargeId: string, qrUrl: string, credits: number, price: number) {
  document.getElementById('qrSummary')!.textContent = `${credits.toLocaleString()} credits / ฿${price.toLocaleString()}`;
  document.getElementById('qrImage')!.setAttribute('src', qrUrl);
  setQrStatus('pending', 'Waiting for payment…');
  document.getElementById('qrOverlay')!.classList.remove('hidden');

  const devBtn = document.getElementById('devPayBtn')!;
  const isDev = API_URL.includes('localhost') || API_URL.includes('127.0.0.1');
  if (isDev) {
    devBtn.classList.remove('hidden');
    devBtn.onclick = () => simulatePayment(chargeId);
  } else {
    devBtn.classList.add('hidden');
  }

  startCountdown(15 * 60);
  startPolling(chargeId, credits);
}

async function simulatePayment(chargeId: string) {
  const btn = document.getElementById('devPayBtn') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Processing…';
  try {
    await fetch(`${API_URL}/payments/dev/complete/${chargeId}`, {
      method: 'POST',
      credentials: 'include',
    });
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Simulate Payment (Dev only)';
  }
}

function closeQrModal() {
  document.getElementById('qrOverlay')!.classList.add('hidden');
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
}

function setQrStatus(state: 'pending' | 'paid' | 'failed', text: string) {
  const dot = document.querySelector<HTMLElement>('.qr-status-dot')!;
  dot.className = `qr-status-dot ${state}`;
  document.getElementById('qrStatusText')!.textContent = text;
}

function startCountdown(seconds: number) {
  let remaining = seconds;
  const el = document.getElementById('qrCountdown')!;

  countdownInterval = setInterval(() => {
    remaining--;
    const m = String(Math.floor(remaining / 60)).padStart(2, '0');
    const s = String(remaining % 60).padStart(2, '0');
    el.textContent = `${m}:${s}`;
    if (remaining <= 0) closeQrModal();
  }, 1000);
}

function startPolling(chargeId: string, credits: number) {
  pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`${API_URL}/payments/charge/${chargeId}/status`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();

      if (data.status === 'PAID') {
        clearInterval(pollInterval!); pollInterval = null;
        clearInterval(countdownInterval!); countdownInterval = null;
        setQrStatus('paid', `Payment successful! +${credits.toLocaleString()} credits`);
        document.getElementById('qrTimer')!.textContent = '';
        setTimeout(() => {
          closeQrModal();
          loadUser();
          loadOrders();
          showToast(`เติม ${credits.toLocaleString()} credits สำเร็จ`);
        }, 2000);
      } else if (data.status === 'FAILED') {
        clearInterval(pollInterval!); pollInterval = null;
        setQrStatus('failed', 'Payment failed or expired');
        document.getElementById('qrTimer')!.textContent = '';
      }
    } catch { /* network error — retry next tick */ }
  }, 3000);
}

async function loadOrders() {
  const res = await fetch(`${API_URL}/payments/orders`, { credentials: 'include' });
  if (!res.ok) return;
  const orders: { id: string; credits: number; amount: number; status: string; createdAt: string }[] = await res.json();

  const card = document.getElementById('historyCard')!;
  if (orders.length === 0) {
    card.innerHTML = `<div class="history-empty"><span>◷</span><p>No transactions yet</p></div>`;
    return;
  }

  card.innerHTML = orders.map(o => `
    <div class="history-row">
      <span class="history-date">${new Date(o.createdAt).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
      <span class="history-desc">Top-up ${o.credits.toLocaleString()} credits</span>
      <span class="history-amount ${o.status === 'PAID' ? 'positive' : 'negative'}">
        ${o.status === 'PAID' ? '+' + o.credits.toLocaleString() : o.status}
      </span>
    </div>
  `).join('');
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
  loadOrders();

  document.getElementById('qrClose')!.addEventListener('click', closeQrModal);
  document.getElementById('qrOverlay')!.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeQrModal();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadUser();
      loadOrders();
    }
  });

  document.getElementById('logoutBtn')!.addEventListener('click', async () => {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    window.location.href = '/';
  });
});

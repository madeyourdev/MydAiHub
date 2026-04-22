import './style.css';

document.body.style.opacity = '1';

const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) throw new Error('VITE_API_URL environment variable is required');

function showMessage(text: string, type: 'success' | 'error') {
  const box = document.getElementById('message') as HTMLDivElement;
  box.textContent = text;
  box.className = `message ${type}`;
}

function setLoading(loading: boolean) {
  const btn = document.getElementById('submitBtn') as HTMLButtonElement;
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm') as HTMLFormElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('message')!.className = 'message hidden';

    const username = (document.getElementById('username') as HTMLInputElement).value.trim();
    const email = (document.getElementById('email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('password') as HTMLInputElement).value;
    const confirmPassword = (document.getElementById('confirmPassword') as HTMLInputElement).value;

    if (password !== confirmPassword) {
      showMessage('Passwords do not match.', 'error');
      return;
    }

    if (password.length < 6) {
      showMessage('Password must be at least 6 characters.', 'error');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Registration failed');

      showMessage('Account created! Redirecting to login...', 'success');
      setTimeout(() => { window.location.href = '/'; }, 1500);
    } catch (err: any) {
      showMessage(err.message, 'error');
    } finally {
      setLoading(false);
    }
  });
});

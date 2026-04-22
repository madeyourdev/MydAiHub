import './style.css';

document.body.style.opacity = '1';

const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) throw new Error('VITE_API_URL environment variable is required');
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

declare const google: any;

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

function onLoginSuccess() {
  window.location.href = '/dashboard.html';
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm') as HTMLFormElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('message')!.className = 'message hidden';

    const username = (document.getElementById('username') as HTMLInputElement).value.trim();
    const password = (document.getElementById('password') as HTMLInputElement).value.trim();

    if (!username || !password) {
      showMessage('Please enter both username and password.', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Login failed');
      onLoginSuccess();
    } catch (err: any) {
      showMessage(err.message, 'error');
    } finally {
      setLoading(false);
    }
  });

  // Google Sign-In
  if (GOOGLE_CLIENT_ID) {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (response: { credential: string }) => {
        document.getElementById('message')!.className = 'message hidden';
        try {
          const res = await fetch(`${API_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ credential: response.credential }),
          });

          const data = await res.json();
          if (!res.ok) throw new Error(data.message || 'Google login failed');
          onLoginSuccess();
        } catch (err: any) {
          showMessage(err.message, 'error');
        }
      },
    });

    google.accounts.id.renderButton(
      document.getElementById('google-btn-container'),
      {
        theme: 'filled_black',
        size: 'large',
        width: 360,
        text: 'signin_with',
        shape: 'rectangular',
      }
    );
  }
});

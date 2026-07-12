// Основная логика фронтенда AuthLauncher
// Регистрация, вход, профиль, выход

const API = CONFIG.API_URL;

// ============ Хелперы ============

/** Сохранить токен */
function saveToken(accessToken, refreshToken) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

/** Получить токен */
function getToken() {
  return localStorage.getItem('accessToken');
}

/** Удалить токен */
function clearToken() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

/** Обновить UI в шапке */
function updateNav() {
  const token = getToken();
  const link = document.getElementById('profileLink');
  if (link) {
    link.style.display = token ? 'inline' : 'none';
  }
}

/** Парсинг JWT (без проверки, только для чтения payload) */
function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

// ============ API запросы ============

/** Регистрация */
async function apiRegister(login, password, email) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password, email }),
  });
  return res.json();
}

/** Вход */
async function apiLogin(login, password, totpCode) {
  const body = { login, password };
  if (totpCode) body.totpCode = totpCode;
  const res = await fetch(`${API}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** Получить профиль */
async function apiGetProfile() {
  const token = getToken();
  if (!token) return { success: false, message: 'Не авторизован' };
  const res = await fetch(`${API}/profile`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  return res.json();
}

/** Health check */
async function apiHealth() {
  try {
    const res = await fetch(`${API}/health`);
    return res.json();
  } catch {
    return { success: false, message: 'Сервер недоступен' };
  }
}

// ============ Главная страница ============

if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
  document.addEventListener('DOMContentLoaded', async () => {
    updateNav();
    const health = await apiHealth();
    const statusEl = document.getElementById('serverStatus');
    const onlineEl = document.getElementById('onlineCount');
    if (health.success) {
      statusEl.textContent = '🟢 Online';
      statusEl.style.color = '#4caf50';
      onlineEl.textContent = '✓';
    } else {
      statusEl.textContent = '🔴 Offline';
      statusEl.style.color = '#f44336';
    }
  });
}

/** Копировать IP */
function copyIp() {
  const ip = document.getElementById('serverIp').textContent;
  navigator.clipboard.writeText(ip).then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.textContent = 'Скопировано!';
    setTimeout(() => { btn.textContent = 'Копировать IP'; }, 2000);
  });
}

// ============ Регистрация ============

if (window.location.pathname.includes('register')) {
  document.addEventListener('DOMContentLoaded', () => {
    updateNav();
    const form = document.getElementById('registerForm');
    const errorEl = document.getElementById('registerError');
    const successEl = document.getElementById('registerSuccess');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';
      successEl.style.display = 'none';

      const login = document.getElementById('login').value.trim();
      const email = document.getElementById('email').value.trim() || undefined;
      const password = document.getElementById('password').value;
      const confirm = document.getElementById('passwordConfirm').value;

      // Валидация
      if (password !== confirm) {
        errorEl.textContent = 'Пароли не совпадают';
        errorEl.style.display = 'block';
        return;
      }
      if (password.length < 8) {
        errorEl.textContent = 'Пароль должен быть минимум 8 символов';
        errorEl.style.display = 'block';
        return;
      }

      const result = await apiRegister(login, password, email);
      if (result.success) {
        successEl.textContent = '✅ Регистрация прошла успешно! Теперь можете войти.';
        successEl.style.display = 'block';
        form.reset();
      } else {
        errorEl.textContent = result.message || 'Ошибка регистрации';
        errorEl.style.display = 'block';
      }
    });
  });
}

// ============ Вход ============

if (window.location.pathname.includes('login')) {
  document.addEventListener('DOMContentLoaded', () => {
    updateNav();
    const form = document.getElementById('loginForm');
    const errorEl = document.getElementById('loginError');
    const totpGroup = document.getElementById('totpGroup');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.style.display = 'none';

      const login = document.getElementById('login').value.trim();
      const password = document.getElementById('password').value;
      const totp = document.getElementById('totp').value.trim() || undefined;

      const result = await apiLogin(login, password, totp);

      if (result.success) {
        saveToken(result.data.accessToken, result.data.refreshToken);
        window.location.href = '/profile.html';
      } else {
        // Если требуется 2FA — показываем поле для кода
        if (result.error?.code === 'TOTP_ERROR') {
          totpGroup.style.display = 'block';
          errorEl.textContent = 'Введите код двухфакторной аутентификации';
        } else {
          errorEl.textContent = result.message || 'Ошибка входа';
        }
        errorEl.style.display = 'block';
      }
    });
  });
}

// ============ Профиль ============

if (window.location.pathname.includes('profile')) {
  document.addEventListener('DOMContentLoaded', async () => {
    updateNav();
    const notLogged = document.getElementById('profileNotLogged');
    const logged = document.getElementById('profileLogged');

    const token = getToken();
    if (!token) {
      notLogged.style.display = 'block';
      logged.style.display = 'none';
      return;
    }

    const result = await apiGetProfile();
    if (!result.success) {
      clearToken();
      notLogged.style.display = 'block';
      logged.style.display = 'none';
      return;
    }

    const user = result.data.profile;
    notLogged.style.display = 'none';
    logged.style.display = 'block';

    document.getElementById('profileLogin').textContent = user.login;
    document.getElementById('profileUuid').textContent = user.uuid;
    document.getElementById('profileRole').textContent = user.roleName || 'USER';
    document.getElementById('profileCreated').textContent = new Date(user.createdAt).toLocaleDateString('ru-RU');
    document.getElementById('profileLastLogin').textContent = user.lastLoginAt
      ? new Date(user.lastLoginAt).toLocaleString('ru-RU')
      : '—';
    document.getElementById('profileLastIp').textContent = user.lastLoginIp || '—';

    const statusEl = document.getElementById('profileStatus');
    if (user.status === 'ACTIVE') {
      statusEl.textContent = '🟢 Активен';
      statusEl.className = 'profile-status status-active';
    } else if (user.status === 'BANNED') {
      statusEl.textContent = '🔴 Заблокирован';
      statusEl.className = 'profile-status status-banned';
    } else {
      statusEl.textContent = '⚫ ' + user.status;
      statusEl.className = 'profile-status';
    }

    document.getElementById('profile2fa').textContent = user.totpEnabled ? '✅ Включена' : '❌ Отключена';

    // Выход
    document.getElementById('logoutBtn').onclick = () => {
      clearToken();
      window.location.href = '/';
    };
  });
}

// Инициализация навигации при загрузке любой страницы
document.addEventListener('DOMContentLoaded', updateNav);
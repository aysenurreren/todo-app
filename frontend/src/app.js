import { client } from "./api/client.js";

// ── DOM Referansları ───────────────────────────────────────────
const authScreen   = document.getElementById("auth-screen");
const appScreen    = document.getElementById("app-screen");
const emailInput   = document.getElementById("email-input");
const passwordInput = document.getElementById("password-input");
const loginBtn     = document.getElementById("login-btn");
const logoutBtn    = document.getElementById("logout-btn");
const newTaskInput = document.getElementById("new-task-input");
const addBtn       = document.getElementById("add-btn");
const errorBanner  = document.getElementById("error-banner");
const taskList     = document.getElementById("task-list");
// ── Doğrulama DOM ──────────────────────────────────────────────
const verifyScreen    = document.getElementById("verify-screen");
const verifyCodeInput = document.getElementById("verify-code-input");
const verifyBtn       = document.getElementById("verify-btn");
const resendBtn       = document.getElementById("resend-btn");
const verifyError     = document.getElementById("verify-error");

// Doğrulama için userId sakla
let pendingUserId = null;
// ── Pomodoro DOM ───────────────────────────────────────────────
const pomodoroBanner   = document.getElementById("pomodoro-banner");
const pomodoroTaskName = document.getElementById("pomodoro-task-name");
const pomodoroTime     = document.getElementById("pomodoro-time");
const pomodoroPlay     = document.getElementById("pomodoro-play");
const pomodoroClose    = document.getElementById("pomodoro-close");
const pomodoroDuration = document.getElementById("pomodoro-duration-input");

// ── State ──────────────────────────────────────────────────────
let globalTasks  = [];
let activeFilter = "ALL";
// ── Pomodoro State ─────────────────────────────────────────────
let timerSeconds  = 25 * 60;
let timerInterval = null;
let timerTaskId   = null;
let isRunning     = false;
let totalWorkedSeconds = 0; // toplam çalışma süresi
// ── Hata Yönetimi ──────────────────────────────────────────────
function showError(msg) {
  errorBanner.style.display = "block";
  errorBanner.textContent   = msg;
}

function hideError() {
  errorBanner.style.display = "none";
}

// ── Doğrulama Ekranını Göster ──────────────────────────────────
function showVerifyScreen(userId) {
  pendingUserId = userId;
  document.querySelector(".auth-card").style.display = "none";
  verifyScreen.style.display = "flex";
  verifyCodeInput.focus();
}

// ── Doğrulama Ekranını Gizle ───────────────────────────────────
function hideVerifyScreen() {
  verifyScreen.style.display  = "none";
  verifyError.style.display   = "none";
  verifyCodeInput.value       = "";
  pendingUserId               = null;
  document.querySelector(".auth-card").style.display = "flex";
}

// ── Doğrula Butonu ─────────────────────────────────────────────
verifyBtn.addEventListener("click", async () => {
  const code = verifyCodeInput.value.trim();
  verifyError.style.display = "none";

  if (!code || code.length !== 6) {
    verifyError.textContent   = "6 haneli kodu eksiksiz gir.";
    verifyError.style.display = "block";
    return;
  }

  try {
    const data = await client.post("/auth/verify", {
      userId: pendingUserId,
      code,
    });

    localStorage.setItem("token", data.token);
    hideVerifyScreen();
    authScreen.style.display = "none";
    appScreen.style.display  = "flex";
    fetchTasks();
  } catch (err) {
    verifyError.textContent   = err.message;
    verifyError.style.display = "block";
  }
});

// ── Tekrar Kod Gönder ──────────────────────────────────────────
resendBtn.addEventListener("click", async () => {
  verifyError.style.display = "none";

  try {
    await client.post("/auth/resend-code", { userId: pendingUserId });
    verifyError.textContent   = "Yeni kod gönderildi.";
    verifyError.style.display = "block";
    verifyError.style.color   = "#059669";
  } catch (err) {
    verifyError.textContent   = err.message;
    verifyError.style.display = "block";
    verifyError.style.color   = "#DC2626";
  }
});

// ── Auth ───────────────────────────────────────────────────────
// ── Auth mod geçişi ────────────────────────────────────────────
let isRegister = false;
const switchBtn  = document.getElementById("switch-auth");
const authTitle  = document.getElementById("auth-title");
const authError  = document.getElementById("auth-error");

switchBtn.addEventListener("click", () => {
  isRegister = !isRegister;
  authTitle.textContent    = isRegister ? "Kayıt Ol"   : "Giriş Yap";
  loginBtn.textContent     = isRegister ? "Kayıt Ol"   : "Giriş Yap";
  switchBtn.textContent    = isRegister ? "Giriş yap"  : "Kayıt ol";
  authError.style.display  = "none";
});

loginBtn.addEventListener("click", async () => {
  const email    = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    authError.textContent   = "E-posta ve şifre zorunludur.";
    authError.style.display = "block";
    return;
  }

  authError.style.display = "none";

  try {
    const endpoint = isRegister ? "/auth/register" : "/auth/login";
    const data = await client.post(endpoint, { email, password });
    localStorage.setItem("token", data.token);
    authScreen.style.display = "none";
    appScreen.style.display  = "flex";
    fetchTasks();
  } catch (err) {
    authError.textContent   = err.message;
    authError.style.display = "block";
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await client.post("/auth/logout");
    localStorage.clear();
    location.reload();
  } catch (err) {
    showError(err.message);
  }
});

// ── Görev Yükleme ──────────────────────────────────────────────
async function fetchTasks() {
  try {
    const data = await client.get("/tasks");
    globalTasks = data.tasks;
    render();
  } catch (err) {
    showError(err.message);
  }
}

// ── Render + Client-Side Filtering ────────────────────────────
function render() {
  const now = new Date();

  const filtered = globalTasks.filter(task => {
    if (activeFilter === "COMPLETED") return task.is_completed === true;
    if (activeFilter === "ACTIVE")    return task.is_completed === false;

    if (activeFilter === "TODAY") {
      const d = new Date(task.created_at);
      return d.getDate()     === now.getDate()  &&
             d.getMonth()    === now.getMonth() &&
             d.getFullYear() === now.getFullYear();
    }

    if (activeFilter === "WEEK") {
      const d       = new Date(task.created_at);
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      return d >= weekAgo;
    }

    if (activeFilter === "MONTH") {
      const d = new Date(task.created_at);
      return d.getMonth()    === now.getMonth() &&
             d.getFullYear() === now.getFullYear();
    }

    return true; // ALL
  });


  // ── Stat kartları ──────────────────────────────────────────
  const total     = globalTasks.length;
  const done      = globalTasks.filter(t => t.is_completed).length;
  const remaining = total - done;
  const rate      = total ? Math.round((done / total) * 100) : 0;

  document.getElementById("stat-total").textContent     = total;
  document.getElementById("stat-done").textContent      = done;
  document.getElementById("stat-remaining").textContent = remaining;
  document.getElementById("stat-rate").textContent      = `%${rate}`;

  const todayCount = globalTasks.filter(t => {
    const d = new Date(t.created_at);
    const n = new Date();
    return d.getDate() === n.getDate() &&
           d.getMonth() === n.getMonth() &&
           d.getFullYear() === n.getFullYear();
  }).length;

  document.getElementById("count-all").textContent   = total;
  document.getElementById("count-today").textContent = todayCount;

  const FILTER_LABELS = {
    ALL: "Tümü", TODAY: "Bugün", WEEK: "Bu hafta",
    MONTH: "Bu ay", ACTIVE: "Aktif", COMPLETED: "Tamamlanan"
  };
  document.getElementById("topbar-title").textContent = FILTER_LABELS[activeFilter];

  document.querySelectorAll(".nav-item[data-filter]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filter === activeFilter);
  });

  const emptyState = document.getElementById("empty-state");
  const isEmpty = filtered.length === 0;
  emptyState.style.display = isEmpty ? "flex" : "none";
  taskList.style.display   = isEmpty ? "flex" : "flex";

  const workedMin = Math.floor(totalWorkedSeconds / 60);
  const workedSec = totalWorkedSeconds % 60;
  document.getElementById("stat-worked").textContent =
    `${workedMin}:${workedSec.toString().padStart(2, "0")}`;

  taskList.innerHTML = "";

  filtered.forEach(task => {
  const date = new Date(task.created_at).toLocaleDateString("tr-TR", {
    day: "numeric", month: "short"
  });

  const item = document.createElement("div");
  item.className = `task-item${task.is_completed ? " is-done" : ""}`;
  item.dataset.taskId = task.id;

  item.innerHTML = `
  <button class="task-check${task.is_completed ? " checked" : ""}" aria-label="Tamamla">
    <i class="ti ti-check"></i>
  </button>
  <div class="task-body">
    <div class="task-title">${escHtml(task.title)}</div>
    <div class="task-date">${date}</div>
  </div>
  <div class="task-actions">
    <button class="task-btn pomodoro-start" title="Pomodoro başlat">
      <i class="ti ti-clock"></i>
    </button>
    <button class="task-btn edit-btn" title="Düzenle">
      <i class="ti ti-edit"></i>
    </button>
    <button class="task-btn del del-btn" title="Sil">
      <i class="ti ti-trash"></i>
    </button>
  </div>
`;

  // Checkbox
item.querySelector(".task-check").addEventListener("click", () => {
  toggleTask(task.id, task.is_completed);
});

// Pomodoro başlat
item.querySelector(".pomodoro-start").addEventListener("click", () => {
  startPomodoro(task.id, task.title);
});

  // Inline edit
  item.querySelector(".edit-btn").addEventListener("click", () => {
    const titleDiv = item.querySelector(".task-title");
    const input = document.createElement("input");
    input.className = "task-edit-input";
    input.value = task.title;
    titleDiv.replaceWith(input);
    input.focus();
    input.select();

    const commit = async () => {
      const val = input.value.trim();
      if (!val || val === task.title) {
        input.replaceWith(titleDiv);
        return;
      }
      try {
        await updateTask(task.id, val, item, titleDiv);
      } catch {
        input.replaceWith(titleDiv);
      }
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter")  { input.removeEventListener("blur", commit); commit(); }
      if (e.key === "Escape") { input.removeEventListener("blur", commit); input.replaceWith(titleDiv); }
    });
  });

  // Sil
  item.querySelector(".del-btn").addEventListener("click", () => deleteTask(task.id, item));

  taskList.appendChild(item);
});
}

// ── Optimistic UI ──────────────────────────────────────────────
async function toggleTask(id, currentStatus) {
  const snapshot = [...globalTasks];

  globalTasks = globalTasks.map(task =>
    task.id === id ? { ...task, is_completed: !currentStatus } : task
  );
  render();

  try {
    await client.put(`/tasks/${id}`, { is_completed: !currentStatus });
  } catch (err) {
    globalTasks = snapshot;
    render();
    showError(err.message);
  }
}

// ── Görev Ekleme ───────────────────────────────────────────────
addBtn.addEventListener("click", async () => {
  const title = newTaskInput.value.trim();
  if (!title) return;

  try {
    const data = await client.post("/tasks", { title });
    globalTasks = [data.task, ...globalTasks];
    newTaskInput.value = "";
    render();
  } catch (err) {
    showError(err.message);
  }
});


// ── Filtreleme ─────────────────────────────────────────────────
document.querySelectorAll("[data-filter]").forEach(btn => {
  btn.addEventListener("click", () => {
    activeFilter = btn.dataset.filter;
    render();
  });
});

// Inline güncelleme
async function updateTask(id, newTitle, itemEl, titleDiv) {
  const snapshot = [...globalTasks];
  const task = globalTasks.find(t => t.id === id);
  task.title = newTitle;
  titleDiv.textContent = newTitle;
  titleDiv.className = "task-title";
  const input = itemEl.querySelector(".task-edit-input");
  if (input) input.replaceWith(titleDiv);

  try {
    await client.put(`/tasks/${id}`, { title: newTitle });
  } catch (err) {
    globalTasks = snapshot;
    showError(err.message);
    render();
  }
}
// ── Görev Silme ────────────────────────────────────────────────
async function deleteTask(id, itemEl) {
  itemEl.classList.add("is-deleting");
  try {
    await client.delete(`/tasks/${id}`);
    globalTasks = globalTasks.filter(task => task.id !== id);
    render();
  } catch (err) {
    itemEl.classList.remove("is-deleting");
    showError(err.message);
  }
}


// XSS koruması
function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Profil Modal ───────────────────────────────────────────────
const profileModal    = document.getElementById("profile-modal");
const modalOverlay    = document.getElementById("modal-overlay");
const modalClose      = document.getElementById("modal-close");
const modalCancel     = document.getElementById("modal-cancel");
const profileEmail    = document.getElementById("profile-email");
const profileNameInput = document.getElementById("profile-name-input");
const profileError    = document.getElementById("profile-error");
const profileSuccess  = document.getElementById("profile-success");
const profileSave     = document.getElementById("profile-save");
const profileAvatarBig = document.getElementById("profile-avatar-big");

// Modalı aç
async function openProfileModal() {
  profileError.style.display   = "none";
  profileSuccess.style.display = "none";

  try {
    const data = await client.get("/profile");
    const user = data.user;

    profileEmail.textContent      = user.email;
    profileNameInput.value        = user.full_name || "";
    profileAvatarBig.textContent  = (user.full_name || user.email)[0].toUpperCase();
  } catch (err) {
    profileError.textContent   = err.message;
    profileError.style.display = "block";
  }

  profileModal.style.display = "flex";
}

// Modalı kapat
function closeProfileModal() {
  profileModal.style.display = "none";
}

// Kaydet
profileSave.addEventListener("click", async () => {
  const full_name = profileNameInput.value.trim();
  profileError.style.display   = "none";
  profileSuccess.style.display = "none";

  if (!full_name) {
    profileError.textContent   = "Ad soyad boş olamaz.";
    profileError.style.display = "block";
    return;
  }

  try {
    const data = await client.put("/profile", { full_name });
    const user = data.user;

    // Sidebar'daki kullanıcı adını güncelle
    document.getElementById("user-display").textContent  = user.full_name || user.email.split("@")[0];
    document.getElementById("user-avatar").textContent   = (user.full_name || user.email)[0].toUpperCase();
    profileAvatarBig.textContent                         = (user.full_name || user.email)[0].toUpperCase();

    profileSuccess.textContent   = "Profil güncellendi!";
    profileSuccess.style.display = "block";

    setTimeout(closeProfileModal, 1200);
  } catch (err) {
    profileError.textContent   = err.message;
    profileError.style.display = "block";
  }
});

// Kapatma event'leri
modalOverlay.addEventListener("click", closeProfileModal);
modalClose.addEventListener("click",   closeProfileModal);
modalCancel.addEventListener("click",  closeProfileModal);

// Sidebar kullanıcı satırına tıklayınca modalı aç
document.querySelector(".user-row").addEventListener("click", openProfileModal);
// ── Pomodoro Fonksiyonları ─────────────────────────────────────

// Saniyeyi MM:SS formatına çevir
function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Ekranı güncelle
function updateTimerDisplay() {
  pomodoroTime.textContent = formatTime(timerSeconds);
}

// Görevi seç ve banner'ı aç
function startPomodoro(taskId, taskTitle) {
  // Önceki timer'ı temizle
  clearInterval(timerInterval);
  isRunning = false;

  // Seçili görevi işaretle
  document.querySelectorAll(".task-item").forEach(el => {
    el.classList.remove("pomodoro-active");
  });
  const activeItem = document.querySelector(`[data-task-id="${taskId}"]`);
  if (activeItem) activeItem.classList.add("pomodoro-active");

  // State güncelle
  timerTaskId   = taskId;
  timerSeconds  = parseInt(pomodoroDuration.value || "25") * 60;

  // Banner'ı göster
  pomodoroTaskName.textContent = taskTitle;
  pomodoroTime.textContent     = formatTime(timerSeconds);
  pomodoroBanner.style.display = "flex";

  // Play butonunu sıfırla
  pomodoroPlay.innerHTML = `<i class="ti ti-player-play"></i>`;
  pomodoroPlay.classList.remove("running");
  pomodoroDuration.disabled = false;
}

// Başlat / Duraklat
function toggleTimer() {
  if (isRunning) {
    // Duraklat
    clearInterval(timerInterval);
    isRunning = false;
    pomodoroPlay.innerHTML = `<i class="ti ti-player-play"></i>`;
    pomodoroPlay.classList.remove("running");
    pomodoroDuration.disabled = false;
  } else {
    // Başlat
    isRunning = true;
    pomodoroPlay.innerHTML = `<i class="ti ti-player-pause"></i>`;
    pomodoroPlay.classList.add("running");
    pomodoroDuration.disabled = true;

    timerInterval = setInterval(() => {
      timerSeconds--;
      totalWorkedSeconds++;
      updateTimerDisplay();

      if (timerSeconds <= 0) {
        clearInterval(timerInterval);
        isRunning = false;
        pomodoroPlay.innerHTML = `<i class="ti ti-player-play"></i>`;
        pomodoroPlay.classList.remove("running");
        pomodoroDuration.disabled = false;
        pomodoroTime.textContent = "00:00";

        // Bildirim
        alert(`✅ "${pomodoroTaskName.textContent}" görevi için süre doldu!`);

        // Görevi otomatik tamamla
        if (timerTaskId) {
          const task = globalTasks.find(t => t.id === timerTaskId);
          if (task && !task.is_completed) {
            toggleTask(timerTaskId, false);
          }
        }
      }
    }, 1000);
  }
}

// Sıfırla
function resetTimer() {
  clearInterval(timerInterval);
  isRunning     = false;
  timerSeconds  = parseInt(pomodoroDuration.value || "25") * 60;
  updateTimerDisplay();
  pomodoroPlay.innerHTML = `<i class="ti ti-player-play"></i>`;
  pomodoroPlay.classList.remove("running");
  pomodoroDuration.disabled = false;
}

// Kapat
function closePomodoro() {
  clearInterval(timerInterval);
  isRunning    = false;
  timerTaskId  = null;
  pomodoroBanner.style.display = "none";
  document.querySelectorAll(".task-item").forEach(el => {
    el.classList.remove("pomodoro-active");
  });
}

// Süre değişince timer'ı güncelle (sadece duraklatılmışsa)
pomodoroDuration.addEventListener("change", () => {
  if (!isRunning) {
    timerSeconds = parseInt(pomodoroDuration.value || "25") * 60;
    updateTimerDisplay();
  }
});

// Buton event'leri
pomodoroPlay.addEventListener("click",  toggleTimer);
pomodoroClose.addEventListener("click", closePomodoro);

// ── Sayfa Yüklendiğinde Token Kontrolü ────────────────────────
if (localStorage.getItem("token")) {
  authScreen.style.display = "none";
  appScreen.style.display  = "flex";
  fetchTasks();
}
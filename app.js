(() => {
  const tg = window.Telegram?.WebApp;
  const vkBridge = window.vkBridge;

  const BACKEND_URL = "https://functions.yandexcloud.net/d4e540tfgstiogekv02p";

  const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 МБ

  const form = document.getElementById("survey-form");
  const errorEl = document.getElementById("error");
  const resultEl = document.getElementById("result");
  const submitBtn = document.getElementById("submit-btn");
  const resumeInput = document.getElementById("resume");

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = "block";
  }
  function clearError() {
    errorEl.textContent = "";
    errorEl.style.display = "none";
  }
  function showResult(msg) {
    resultEl.textContent = msg;
    resultEl.style.display = "block";
  }

  function disableForm() {
    const els = form.querySelectorAll("input, select, textarea, button");
    els.forEach((el) => (el.disabled = true));
  }

  function enableForm() {
    const els = form.querySelectorAll("input, select, textarea, button");
    els.forEach((el) => (el.disabled = false));
  }

  // ---------- ID (TG / VK / fallback) ----------
  function getTgUserIdSync() {
    const id = tg?.initDataUnsafe?.user?.id;
    if (id) return String(id);

    const urlId = new URLSearchParams(location.search).get("tg_id");
    if (urlId) return String(urlId);

    return null;
  }

  async function getVkUserIdAsync() {
    try {
      if (!vkBridge) return null;

      await vkBridge.send("VKWebAppInit");
      const info = await vkBridge.send("VKWebAppGetUserInfo");
      const id = info?.id;
      if (!id) return null;

      return String(id) + "_VK";
    } catch (_) {
      const urlId = new URLSearchParams(location.search).get("vk_id");
      if (urlId) return String(urlId) + "_VK";
      return null;
    }
  }

  async function getUserId() {
    const tgId = getTgUserIdSync();
    if (tgId) return tgId;

    const vkId = await getVkUserIdAsync();
    if (vkId) return vkId;

    return null;
  }

  // ---------- Проверка "уже отправляли" ----------
  async function checkAlreadySubmitted(userId) {
    const url = new URL(BACKEND_URL);
    url.searchParams.set("mode", "check");
    url.searchParams.set("tg_id", userId);

    const res = await fetch(url.toString(), { method: "GET" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.message || `Ошибка проверки: ${res.status}`);
    }

    return {
      exists: Boolean(data?.exists),
      message: data?.message,
    };
  }

  // ---------- TG init ----------
  try {
    tg?.ready();
    tg?.expand();
  } catch (_) {}

  // ---------- File size check ----------
  resumeInput?.addEventListener("change", () => {
    clearError();
    const file = resumeInput.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      showError("Слишком большой файл. Максимум 15 МБ.");
      resumeInput.value = "";
    }
  });

  // ---------- MAIN INIT ----------
  let userId = null;

  (async () => {
    clearError();
    resultEl.style.display = "none";
    disableForm();
    submitBtn.textContent = "Загрузка…";

    userId = await getUserId();

    if (!userId) {
      showError("Не удалось определить пользователя. Откройте миниапп внутри Telegram или VK.");
      submitBtn.textContent = "Отправить";
      return;
    }

    try {
      const check = await checkAlreadySubmitted(userId);

      if (check.exists) {
        showResult(check.message || "Вы уже отправляли этот опрос. Повторная отправка недоступна.");
        disableForm();
        return;
      }
    } catch (err) {
      showError(err?.message || "Не удалось проверить, отправляли ли вы уже опрос.");
      disableForm();
      submitBtn.textContent = "Отправить";
      return;
    }

    enableForm();
    submitBtn.textContent = "Отправить";
  })();

  // ---------- SUBMIT ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    resultEl.style.display = "none";

    if (!userId) {
      showError("Не удалось определить пользователя.");
      return;
    }

    const resumeFile = resumeInput?.files?.[0];
    if (!resumeFile) {
      showError("Прикрепите резюме (файл обязателен).");
      return;
    }

    if (resumeFile.size > MAX_FILE_SIZE) {
      showError("Слишком большой файл. Максимум 15 МБ.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Отправляю…";

    try {
      const fd = new FormData();
      fd.append("tg_id", userId);

      fd.append("salary", document.getElementById("salary").value);
      fd.append("resume", resumeFile, resumeFile.name);

      if (tg?.initData) fd.append("tg_init_data", tg.initData);

      const res = await fetch(BACKEND_URL, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 413) {
          showError("Слишком большой файл. Максимум 15 МБ.");
          return;
        }
        showError(data?.message || `Ошибка: ${res.status}`);
        return;
      }

      showResult(data?.message || "Готово!");
      disableForm();

      try {
        tg?.HapticFeedback?.notificationOccurred("success");
      } catch (_) {}
    } catch (err) {
      showError(err?.message || "Неизвестная ошибка при отправке.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Отправить";
    }
  });
})();

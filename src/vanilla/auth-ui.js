/* ═══════════════════════════════════════════════════
 *  Game Hub — Auth UI (Simple Login/Register)
 *  Creates a <dialog> overlay for non-Discord access
 * ═══════════════════════════════════════════════════ */

const AUTH_TOKEN_KEY = "hub_auth_token";
const AUTH_USER_KEY = "hub_auth_user";

/** Check if user has a stored session */
export function getStoredAuth() {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const user = localStorage.getItem(AUTH_USER_KEY);
    if (token && user) {
      return { token, ...JSON.parse(user) };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

/** Store session after login/register */
export function storeAuth(token, userId, username) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify({ userId, username }));
}

/** Clear stored session */
export function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem("gh_token");
  localStorage.removeItem("gh_userId");
  localStorage.removeItem("gh_username");
}

/** Validate stored token against server */
export async function validateStoredToken() {
  const stored = getStoredAuth();
  if (!stored) return null;

  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${stored.token}` },
    });
    if (!res.ok) {
      clearAuth();
      return null;
    }
    const data = await res.json();
    return {
      token: stored.token,
      userId: data.userId,
      username: data.username,
    };
  } catch {
    return null; // Network error — keep stored auth, don't clear
  }
}

/** Show login/register dialog. Returns { token, userId, username } on success. */
export function showAuthDialog() {
  return new Promise((resolve) => {
    // Remove existing dialog if any
    const existing = document.getElementById("auth-dialog");
    if (existing) existing.remove();

    const dialog = document.createElement("dialog");
    dialog.id = "auth-dialog";
    dialog.className = "auth-dialog";
    dialog.innerHTML = `
      <div class="auth-card">
        <div class="auth-header">
          <h2 class="auth-title">🎮 Game Hub</h2>
          <p class="auth-subtitle">Sign in to save your progress</p>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">Sign In</button>
          <button class="auth-tab" data-tab="register">Create Account</button>
        </div>

        <form class="auth-form" id="auth-form" autocomplete="off">
          <div class="auth-field">
            <label for="auth-username">Username</label>
            <input type="text" id="auth-username" name="username"
                   placeholder="3–20 chars (letters, numbers, _)"
                   minlength="3" maxlength="20" pattern="[a-zA-Z0-9_]+"
                   required autocomplete="username" />
          </div>
          <div class="auth-field">
            <label for="auth-password">Password</label>
            <input type="password" id="auth-password" name="password"
                   placeholder="At least 4 characters"
                   minlength="4" required autocomplete="current-password" />
          </div>
          <div class="auth-error" id="auth-error"></div>
          <button type="submit" class="auth-submit" id="auth-submit">
            Sign In
          </button>
        </form>

        <div class="auth-demo-link">
          <button class="auth-demo-btn" id="auth-demo-btn" type="button">
            Continue as Guest
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Tab switching
    let currentTab = "login";
    const tabs = dialog.querySelectorAll(".auth-tab");
    const submitBtn = dialog.querySelector("#auth-submit");
    const errorEl = dialog.querySelector("#auth-error");
    const form = dialog.querySelector("#auth-form");
    const usernameInput = dialog.querySelector("#auth-username");
    const passwordInput = dialog.querySelector("#auth-password");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        currentTab = tab.dataset.tab;
        tabs.forEach((t) => t.classList.toggle("active", t === tab));
        submitBtn.textContent =
          currentTab === "login" ? "Sign In" : "Create Account";
        passwordInput.setAttribute(
          "autocomplete",
          currentTab === "login" ? "current-password" : "new-password",
        );
        errorEl.textContent = "";
      });
    });

    // Form submit
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.textContent = "";
      submitBtn.disabled = true;
      submitBtn.textContent = "Loading…";

      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      const endpoint =
        currentTab === "login" ? "/api/auth/login" : "/api/auth/register";

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();

        if (!res.ok) {
          errorEl.textContent = data.error || "Something went wrong";
          submitBtn.disabled = false;
          submitBtn.textContent =
            currentTab === "login" ? "Sign In" : "Create Account";
          return;
        }

        // Success — store auth and resolve
        storeAuth(data.token, data.userId, data.username);
        dialog.close();
        dialog.remove();
        resolve({
          token: data.token,
          userId: data.userId,
          username: data.username,
        });
      } catch (e) {
        errorEl.textContent = "Network error — check your connection";
        submitBtn.disabled = false;
        submitBtn.textContent =
          currentTab === "login" ? "Sign In" : "Create Account";
      }
    });

    // Guest mode button
    dialog.querySelector("#auth-demo-btn").addEventListener("click", () => {
      dialog.close();
      dialog.remove();
      resolve(null); // null = continue as guest
    });

    // Prevent closing via escape (must authenticate or choose guest)
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
    });

    dialog.showModal();
    usernameInput.focus();
  });
}

/** Logout: clear session + call server */
export async function logout() {
  const stored = getStoredAuth();
  if (stored?.token) {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${stored.token}` },
      });
    } catch {
      /* best-effort */
    }
  }
  clearAuth();
  // Reload to show login screen
  window.location.reload();
}

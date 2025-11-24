// auth.js
// Handles register + login using Realtime Database, SHA-256 password hashing
// and optional admin unlock with a master password.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBi9MKK_bhjIymbvoe1WNjZYHfhzaC_EHQ",
  authDomain: "localwebchat.firebaseapp.com",
  databaseURL: "https://localwebchat-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "localwebchat",
  storageBucket: "localwebchat.firebasestorage.app",
  messagingSenderId: "508495711943",
  appId: "1:508495711943:web:fb438f6a1fd138b29cf8e2",
  measurementId: "G-G6YGYZP6YS"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getDatabase(app);

const $ = id => document.getElementById(id);
const path = window.location.pathname.toLowerCase();

/* ---------- helpers ---------- */

function sanitizeUsername(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, "").slice(0, 24);
}

async function hashPassword(password) {
  try {
    const enc = new TextEncoder().encode(password);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // fallback (should not happen in modern browsers)
    return password;
  }
}

function saveSession(id, profile) {
  const data = {
    id,
    username: profile.username,
    color: profile.color || "#0078ff",
    avatar: profile.avatar || "",
    role: profile.role || "user",
    email: profile.email || ""
  };
  localStorage.setItem("sc_user", JSON.stringify(data));
}

/* ---------- register page ---------- */

if (path.endsWith("register.html")) {
  const btn = $("register-btn");
  if (btn) {
    btn.onclick = async () => {
      const usernameRaw = $("reg-username").value.trim();
      const email = $("reg-email").value.trim();
      const pass = $("reg-password").value;
      const pass2 = $("reg-password2").value;

      if (!usernameRaw || !pass || !pass2) {
        alert("Fill username and passwords.");
        return;
      }
      if (pass !== pass2) {
        alert("Passwords don't match.");
        return;
      }

      const id = sanitizeUsername(usernameRaw);
      if (!id) {
        alert("Only a–z, 0–9, - and _ allowed in username.");
        return;
      }

      const userRef = ref(db, "users/" + id);
      const existing = await get(userRef);
      if (existing.exists()) {
        alert("That username is already taken.");
        return;
      }

      const passHash = await hashPassword(pass);
      const baseProfile = {
        username: usernameRaw,
        email: email || "",
        color: "#0078ff",
        avatar: "",
        role: "user",
        created: Date.now()
      };

      await set(userRef, {
        ...baseProfile,
        passHash
      });

      await set(ref(db, "profiles/" + id), baseProfile);

      saveSession(id, baseProfile);
      window.location.href = "chat.html";
    };
  }
}

/* ---------- login page ---------- */

if (path.endsWith("login.html")) {
  const btn = $("login-btn");
  if (btn) {
    btn.onclick = async () => {
      const usernameRaw = $("login-username").value.trim();
      const pass = $("login-password").value;

      if (!usernameRaw || !pass) {
        alert("Fill both fields.");
        return;
      }

      const id = sanitizeUsername(usernameRaw);
      const userRef = ref(db, "users/" + id);
      const snap = await get(userRef);

      if (!snap.exists()) {
        alert("User not found.");
        return;
      }

      const user = snap.val();
      const passHash = await hashPassword(pass);

      if (passHash !== user.passHash) {
        alert("Wrong password.");
        return;
      }

      let profile = {
        username: user.username,
        email: user.email || "",
        color: user.color || "#0078ff",
        avatar: user.avatar || "",
        role: user.role || "user",
        created: user.created || Date.now()
      };

      // Save normal session first
      saveSession(id, profile);

      // ---------- admin unlock ----------
      // If this uid is in adminUsers, allow them to enter master admin password
      const adminFlagSnap = await get(ref(db, "adminUsers/" + id));
      if (adminFlagSnap.exists()) {
        const pw = prompt("Enter admin password (leave blank to continue as normal user):");
        if (pw) {
          const hash = await hashPassword(pw);
          const storedHashSnap = await get(ref(db, "adminConfig/masterPasswordHash"));
          if (storedHashSnap.exists() && hash === storedHashSnap.val()) {
            profile.role = "admin";
            saveSession(id, profile);

            // update stored role (optional but nice)
            await update(ref(db, "users/" + id), { role: "admin" });
            await update(ref(db, "profiles/" + id), { role: "admin" });

            alert("Admin mode unlocked.");
          } else {
            alert("Wrong admin password. Logged in as normal user.");
          }
        }
      }

      window.location.href = "chat.html";
    }; 
  }
}

// Optional: auto-redirect logged-in users.
if (path.endsWith("login.html") || path.endsWith("register.html")) {
  const existing = localStorage.getItem("sc_user");
  if (existing) {
    // window.location.href = "chat.html";
  }
}

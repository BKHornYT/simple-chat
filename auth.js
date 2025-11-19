import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  set
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
const auth = getAuth(app);
const db = getDatabase(app);

const $ = id => document.getElementById(id);
const path = window.location.pathname.toLowerCase();

/* LOGIN PAGE */
if (path.endsWith("login.html")) {
  const btn = $("login-btn");
  if (btn) {
    btn.onclick = async () => {
      const email = $("login-email").value.trim();
      const pass = $("login-password").value.trim();
      if (!email || !pass) {
        alert("Fill all fields.");
        return;
      }
      try {
        await signInWithEmailAndPassword(auth, email, pass);
        window.location.href = "chat.html";
      } catch (err) {
        alert("Login failed: " + err.message);
      }
    };
  }
}

/* REGISTER PAGE */
if (path.endsWith("register.html")) {
  const btn = $("register-btn");
  if (btn) {
    btn.onclick = async () => {
      const username = $("reg-username").value.trim();
      const email = $("reg-email").value.trim();
      const pass = $("reg-password").value.trim();
      const pass2 = $("reg-password2").value.trim();

      if (!username || !email || !pass || !pass2) {
        alert("Fill all fields.");
        return;
      }
      if (pass !== pass2) {
        alert("Passwords don't match.");
        return;
      }

      try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const uid = cred.user.uid;

        await set(ref(db, "profiles/" + uid), {
          username,
          color: "#0078ff",
          avatar: "",
          email
        });

        if (username.toLowerCase() === "bkhorn") {
          await set(ref(db, "roles/" + uid), "admin");
        }

        window.location.href = "chat.html";
      } catch (err) {
        alert("Registration failed: " + err.message);
      }
    };
  }
}

/* CHAT PAGE GUARD */
if (path.endsWith("chat.html")) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = "login.html";
    }
  });
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase, ref, push, set, onChildAdded, update, onValue
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBi9MKK_bhjIymbvoe1WNjZYHfhzaC_EHQ",
  authDomain: "localwebchat.firebaseapp.com",
  databaseURL: "https://localwebchat-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "localwebchat",
  storageBucket: "localwebchat.firebasestorage.app",
  messagingSenderId: "508495711943",
  appId: "1:508495711943:web:fb438f6a1fd138b29cf8e2",
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

const authPanel  = document.getElementById("auth-panel");
const chat       = document.getElementById("chat-container");

const usernameIn = document.getElementById("username-input");
const joinBtn    = document.getElementById("join-btn");

const messagesDiv = document.getElementById("messages");
const userInput   = document.getElementById("user-input");
const sendBtn     = document.getElementById("send-btn");
const typingEl    = document.getElementById("typing-indicator");

const editBtn     = document.getElementById("edit-profile-btn");
const modal       = document.getElementById("profile-modal");
const modalName   = document.getElementById("profile-username");
const modalColor  = document.getElementById("profile-color");

let username = localStorage.getItem("chatUsername") || "";
let accent   = localStorage.getItem("chatAccent")   || "#0078ff";
let typingTimer;

const initial = n => n.charAt(0).toUpperCase();

// ✅ If username saved → skip login
if (username) {
  usernameIn.value = username;
}

// ✅ Display message bubble
function addMsg({ text, username:uname, timestamp }) {
  const wrap = document.createElement("div");
  wrap.className = "message" + (uname === username ? " self" : "");

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.style.background = uname === username ? accent : "#555";
  avatar.textContent = initial(uname);

  const box = document.createElement("div");
  box.className = "msg-content";

  const head = document.createElement("div");
  head.className = "msg-header";
  head.innerHTML = `${uname} <span class="timestamp">${timestamp}</span>`;

  const body = document.createElement("div");
  body.textContent = text;

  box.append(head, body);
  wrap.append(avatar, box);

  messagesDiv.appendChild(wrap);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ✅ Listen for real-time messages (GLOBAL)
onChildAdded(ref(db, "global/messages"), snap => {
  addMsg(snap.val());
});

// ✅ Join the chat
joinBtn.onclick = () => {
  const name = usernameIn.value.trim();
  if (!name) return alert("Choose a username.");

  username = name;
  localStorage.setItem("chatUsername", username);

  authPanel.style.display = "none";
  chat.style.display = "block";
};

// ✅ Send message
function sendMessage() {
  const text = userInput.value.trim();
  if (!text) return;

  const msg = {
    text,
    username,
    timestamp: new Date().toLocaleTimeString()
  };

  push(ref(db, "global/messages"), msg);

  userInput.value = "";
}

sendBtn.onclick = sendMessage;
userInput.onkeypress = e => {
  if (e.key === "Enter") sendMessage();
};

// ✅ Typing indicator
userInput.addEventListener("input", () => {
  update(ref(db, "typing/" + username), true);

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    update(ref(db, "typing/" + username), false);
  }, 800);
});

onValue(ref(db, "typing"), snap => {
  const data = snap.val() || {};
  const someoneTyping = Object.entries(data).some(
    ([name, state]) => name !== username && state === true
  );
  typingEl.style.display = someoneTyping ? "block" : "none";
});

// ✅ Profile edit modal
editBtn.onclick = () => {
  modalName.value = username;
  modalColor.value = accent;
  modal.showModal();
};

document.getElementById("profile-cancel").onclick = () => modal.close();

document.getElementById("profile-save").onclick = () => {
  username = modalName.value.trim() || username;
  localStorage.setItem("chatUsername", username);

  accent = modalColor.value;
  localStorage.setItem("chatAccent", accent);

  modal.close();
};

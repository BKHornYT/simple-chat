import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getDatabase, 
    ref, 
    set, 
    onChildAdded 
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
const db = getDatabase(app);

const messagesDiv = document.getElementById("messages");
const userInput   = document.getElementById("user-input");
const sendBtn     = document.getElementById("send-btn");

// ✅ Ask username once
let username = localStorage.getItem("chatUsername");
if (!username) {
    username = prompt("Choose a username:");
    localStorage.setItem("chatUsername", username);
}

// ✅ Avatar generator
function getAvatarColor(name) {
    const colors = ["red", "blue", "green", "purple", "orange", "pink", "teal"];
    return colors[name.toUpperCase().charCodeAt(0) % colors.length];
}

// ✅ Track last sent message to block duplicate from Firebase
let lastSentMessage = "";

// ✅ Add message to UI (works for old + new messages)
function addMessage(data, isSelf) {
    const wrapper = document.createElement("div");
    wrapper.classList.add("message");

    if (isSelf) wrapper.classList.add("self");

    // Avatar
    const avatar = document.createElement("div");
    avatar.classList.add("avatar");
    avatar.style.background = getAvatarColor(data.username);

    // Message content wrapper
    const content = document.createElement("div");
    content.classList.add("msg-content");

    // Username + timestamp row
    const header = document.createElement("div");
    header.classList.add("msg-header");
    header.innerHTML = `${data.username} <span class="timestamp">${data.timestamp}</span>`;

    // Message text
    const body = document.createElement("div");
    body.textContent = data.text;

    content.appendChild(header);
    content.appendChild(body);

    wrapper.appendChild(avatar);
    wrapper.appendChild(content);

    messagesDiv.appendChild(wrapper);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ✅ SEND MESSAGE
function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    const id = Date.now();
    const timestamp = new Date().toLocaleTimeString();

    const data = {
        text: text,
        timestamp: timestamp,
        username: username
    };

    lastSentMessage = text; // ✅ remember for duplicate prevention

    set(ref(db, "messages/" + id), data);

    addMessage(data, true); // ✅ show instantly

    userInput.value = "";
}

// ✅ Enter key
userInput.addEventListener("keypress", e => {
    if (e.key === "Enter") sendMessage();
});

// ✅ Send button
sendBtn.addEventListener("click", sendMessage);

// ✅ RECEIVE MESSAGES (OLD + NEW)
onChildAdded(ref(db, "messages"), snapshot => {
    const data = snapshot.val();

    // ✅ Prevent only ONE duplicate: the exact message we just sent
    if (data.text === lastSentMessage && data.username === username) {
        return;
    }

    addMessage(data, data.username === username);
});

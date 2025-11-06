


// Wait until the page and Firebase are ready
window.addEventListener("load", () => {

  //  Check that Firebase is loaded
  if (!window.firebase) {
    console.error("Firebase not found. Make sure firebase-app-compat.js and firebase-database-compat.js are loaded BEFORE this file.");
    return;
  }

  //  Make sure Firebase is initialized
  if (!window.db) {
    const firebaseConfig = {
      apiKey: "AIzaSyBi9MKK_bhjIymbvoe1WNjZYHfhzaC_EHQ",
      authDomain: "localwebchat.firebaseapp.com",
      databaseURL: "https://localwebchat-default-rtdb.europe-west1.firebasedatabase.app/",
      projectId: "localwebchat",
      storageBucket: "localwebchat.appspot.com",
      messagingSenderId: "508495711943",
      appId: "1:508495711943:web:fb438f6a1fd138b29cf8e2",
    };
    const app = firebase.initializeApp(firebaseConfig);
    window.db = firebase.database();
  }

// ✅ HTML elements
const messagesDiv = document.getElementById("messages");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");

// ✅ Add UI message
function addMessage(text) {
    console.log("📥 addMessage:", text);
    const div = document.createElement("div");
    div.classList.add("message");
    div.textContent = text;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ✅ Send message
function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    console.log("📤 Sending message:", text);

    const id = Date.now();

    set(ref(db, "messages/" + id), { text })
        .then(() => console.log("✅ Message written to Firebase"))
        .catch(err => console.error("❌ ERROR writing message:", err));

    userInput.value = "";
}

// ✅ Enter to send
userInput.addEventListener("keypress", e => {
    if (e.key === "Enter") sendMessage();
});

// ✅ Button to send
sendBtn.addEventListener("click", sendMessage);

// ✅ Listen for messages
console.log("👂 Setting up listener…");
onChildAdded(ref(db, "messages"), snapshot => {
    console.log("✅ Listener triggered!");
    const data = snapshot.val();
    console.log("📦 Received from Firebase:", data);
    addMessage(data.text);
});

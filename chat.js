// Wait until the page and Firebase are ready
window.addEventListener("load", () => {

  // ✅ Check that Firebase is loaded
  if (!window.firebase) {
    console.error("Firebase not found. Make sure firebase-app-compat.js and firebase-database-compat.js are loaded BEFORE this file.");
    return;
  }

  // ✅ Make sure Firebase is initialized
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

  // ✅ Select elements
  const sendBtn = document.getElementById("send-btn");
  const userInput = document.getElementById("user-input");
  const messagesDiv = document.getElementById("messages");

  // ✅ Send message on Enter
  userInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
      sendMessage();
    }
  });

  sendBtn.addEventListener("click", sendMessage);

  // ✅ Function to send message to Firebase
  function sendMessage() {
    const text = userInput.value.trim();
    if (text) {
      const time = Date.now();
      db.ref("messages/" + time)
        .set({ text: text })
        .then(() => console.log("✅ Sent:", text))
        .catch((err) => console.error("❌ Failed to send:", err));
      userInput.value = "";
    }
  }

  // ✅ Function to display messages
  function addMessage(sender, text) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", sender);
    messageDiv.innerText = text;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // ✅ Listen for new messages in realtime
  db.ref("messages").on("child_added", (snapshot) => {
    const msg = snapshot.val();
    console.log("📩 Received:", msg.text);
    addMessage("bot", msg.text);
  });
});

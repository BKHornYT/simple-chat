// Select elements
const sendBtn = document.getElementById("send-btn");
const userInput = document.getElementById("user-input");
const messagesDiv = document.getElementById("messages");

// send messages
userInput.addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
        const message = userInput.value;
        userInput.value = "";
        addMessage("user", message);
    }
});

document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
sendBtn.addEventListener("click", () => {
    const message = userInput.value;
    userInput.value = "";
    addMessage("user", message);
});

// Function to add messages to chat
function addMessage(sender, text) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", sender);
    messageDiv.innerText = text;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// make everyone see messages in real-time
const socket = new WebSocket("ws://localhost:5500");

socket.onmessage = function (event) {
    const data = JSON.parse(event.data);
    addMessage("bot", data.message);    
};
 
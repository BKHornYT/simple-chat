const startChatButton = document.getElementById('start-chat-btn');

if (startChatButton) {
    startChatButton.addEventListener('click', () => {
        window.location.href = 'chat.html';
    });
}

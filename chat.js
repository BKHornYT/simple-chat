const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const messagesContainer = document.getElementById('messages');

const defaultResponses = [
    'Fortell meg mer!',
    'Så spennende! Hva skjedde videre?',
    'Jeg er helt enig.',
    'Det høres ut som en bra idé.',
    'Hva tenker du selv om det?'
];

const intentResponses = [
    { keywords: ['hei', 'hallo', 'god dag'], response: 'Hei! Hyggelig å se deg her 👋' },
    {
        keywords: ['hjelp', 'hvordan', 'funker'],
        response: 'Jeg er en enkel demobot. Bare skriv en melding, så svarer jeg med noe hyggelig.'
    },
    { keywords: ['takk', 'thanks'], response: 'Bare hyggelig! 😊' },
    { keywords: ['hadet', 'ha det', 'snakkes'], response: 'Snakkes senere! 👋' }
];

function addMessage(author, text) {
    if (!messagesContainer) {
        return;
    }

    const message = document.createElement('div');
    message.className = `message message--${author}`;
    message.textContent = text;
    messagesContainer.appendChild(message);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function getBotResponse(message) {
    const cleaned = message.trim().toLowerCase();

    const matchedIntent = intentResponses.find(({ keywords }) =>
        keywords.some((keyword) => cleaned.includes(keyword))
    );

    if (matchedIntent) {
        return matchedIntent.response;
    }

    return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}

function handleSubmit(event) {
    event.preventDefault();

    if (!userInput) {
        return;
    }

    const message = userInput.value.trim();
    if (!message) {
        return;
    }

    addMessage('user', message);
    userInput.value = '';

    setTimeout(() => {
        const botReply = getBotResponse(message);
        addMessage('bot', botReply);
    }, 400);
}

if (chatForm) {
    chatForm.addEventListener('submit', handleSubmit);

    if (userInput) {
        userInput.focus();
    }
}

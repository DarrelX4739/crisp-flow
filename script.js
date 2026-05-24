import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// =============================================================
//      PASTE YOUR ACTUAL FIREBASE WEB CONSOLE API KEYS HERE:
// =============================================================
const firebaseConfig = {
    apiKey: "YOUR_API_KEY_HERE",
    authDomain: "YOUR_PROJECT_ID_HERE.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID_HERE",
    storageBucket: "YOUR_PROJECT_ID_HERE.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID_HERE",
    appId: "YOUR_APP_ID_HERE"
};

// Initialize Connection Instances
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Application Active Runtime States
let currentUser = null;
let currentReplyTargetId = null;

// Document Target Element Selectors
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');
const btnLogin = document.getElementById('btn-login');
const btnSignup = document.getElementById('btn-signup');
const btnLogout = document.getElementById('btn-logout');
const userDisplay = document.getElementById('user-display');

// --- AUTHENTICATION CONTROLLERS ---
btnSignup.addEventListener('click', async () => {
    try {
        await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
        alert("Welcome to Crisp Flow! Account created successfully.");
    } catch (err) { alert("Registration Error: " + err.message); }
});

btnLogin.addEventListener('click', async () => {
    try {
        await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
    } catch (err) { alert("Login Error: " + err.message); }
});

btnLogout.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        userDisplay.textContent = user.email;
        authContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        initRealtimeSyncs();
    } else {
        currentUser = null;
        authContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
});

// --- NAVIGATION INTERACTION HANDLERS ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab).classList.remove('hidden');
    });
});

// --- TASK MODAL DISPLAY CONTROLS ---
const taskModal = document.getElementById('task-modal');
document.getElementById('btn-open-task-modal').addEventListener('click', () => taskModal.classList.remove('hidden'));
document.getElementById('btn-close-modal').addEventListener('click', () => taskModal.classList.add('hidden'));

// --- FIREBASE LIVE SYNCHRONIZATION ENGINES ---
function initRealtimeSyncs() {
    // Priority Sorting Weight Mapping Object
    const priorityWeight = { high: 1, medium: 2, low: 3 };

    // 1. Live Task Manager Feed (Sorted natively by Due Date, then by Priority Level)
    onSnapshot(collection(db, "tasks"), (snapshot) => {
        let taskArray = [];
        snapshot.forEach(doc => {
            taskArray.push({ id: doc.id, ...doc.data() });
        });

        // Double Sorting Engine Algorithm execution
        taskArray.sort((a, b) => {
            let dateDiff = new Date(a.dueDate) - new Date(b.dueDate);
            if (dateDiff !== 0) return dateDiff; // First organize by structural chronological dates
            return priorityWeight[a.priority] - priorityWeight[b.priority]; // Then break ties by high/med/low weights
        });

        renderTasks(taskArray);
    });

    // 2. Realtime Team Chat Feed Engine Pipeline
    const chatQuery = query(collection(db, "messages"), orderBy("timestamp", "asc"));
    onSnapshot(chatQuery, (snapshot) => {
        renderChat(snapshot);
    });
}

// --- TASK WRITE PROCESSING MANAGEMENT ---
document.getElementById('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const taskData = {
        name: document.getElementById('task-name').value,
        priority: document.getElementById('task-priority').value,
        dueDate: document.getElementById('task-date').value,
        userId: currentUser.uid
    };
    await addDoc(collection(db, "tasks"), taskData);
    taskModal.classList.add('hidden');
    document.getElementById('task-form').reset();
});

function renderTasks(tasks) {
    const container = document.getElementById('task-list');
    container.innerHTML = "";
    tasks.forEach(task => {
        const card = document.createElement('div');
        card.className = `task-card ${task.priority}`;
        card.innerHTML = `
            <h4>${task.name}</h4>
            <p style="margin: 0.5rem 0 0.25rem 0; font-size: 0.85rem; color: var(--text-muted);">Priority: ${task.priority.toUpperCase()}</p>
            <p style="font-size: 0.85rem; color: var(--text-muted);">Due: ${task.dueDate}</p>
        `;
        container.appendChild(card);
    });
}

// --- REAL-TIME TAB ROOM CHAT LAYER CONTROLLER ---
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const replyPreview = document.getElementById('reply-preview');
const replyTargetText = document.getElementById('reply-target-text');

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!chatInput.value.trim()) return;

    const msgPayload = {
        text: chatInput.value,
        senderEmail: currentUser.email,
        senderUid: currentUser.uid,
        timestamp: serverTimestamp(),
        reactions: {}, // Tracks mapped structures of string reactions: { userId: chosenEmoji }
        replyTo: currentReplyTargetId
    };

    await addDoc(collection(db, "messages"), msgPayload);
    chatInput.value = "";
    clearReplyState();
});

function renderChat(snapshot) {
    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML = "";

    // Generate local mapping cache to resolve reply thread structures instantly
    const msgLookup = {};
    snapshot.forEach(doc => msgLookup[doc.id] = doc.data());

    snapshot.forEach(docSnap => {
        const id = docSnap.id;
        const msg = docSnap.data();
        const isMe = msg.senderUid === currentUser.uid;

        const wrapper = document.createElement('div');
        wrapper.className = `msg-wrapper ${isMe ? 'outgoing' : 'incoming'}`;

        // Compute, evaluate and loop through emoji reaction lists
        let reactionHTML = '';
        if (msg.reactions && Object.keys(msg.reactions).length > 0) {
            const counts = {};
            Object.values(msg.reactions).forEach(emoji => counts[emoji] = (counts[emoji] || 0) + 1);
            reactionHTML = `<div class="react-bar">` + Object.entries(counts).map(([em, cnt]) => `${em} ${cnt}`).join(' ') + `</div>`;
        }

        // Check if message references an existing reply thread
        let replyHeaderHTML = '';
        if (msg.replyTo && msgLookup[msg.replyTo]) {
            replyHeaderHTML = `<div class="msg-reply-ref">↳ Replying to: "${msgLookup[msg.replyTo].text.substring(0,15)}..."</div>`;
        }

        wrapper.innerHTML = `
            <span class="msg-meta">${msg.senderEmail}</span>
            <div class="msg-bubble" data-id="${id}">
                ${replyHeaderHTML}
                <div class="msg-text">${msg.text}</div>
                ${reactionHTML}
            </div>
            <div class="msg-actions">
                <span class="action-lnk btn-react" data-id="${id}">React</span>
                <span class="action-lnk btn-reply" data-id="${id}" data-text="${msg.text}">Reply</span>
                ${isMe ? `<span class="action-lnk btn-delete" data-id="${id}">Delete</span>` : ''}
            </div>
        `;
        chatBox.appendChild(wrapper);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
    bindChatActionListeners(msgLookup);
}

// Attach listeners for interactive elements within chat updates
function bindChatActionListeners(msgLookup) {
    // Explicit array filter options containing: happy, mad, sad, thumbs up, thumbs down, fire, laugh, skull, heart
    const emojis = ["😀", "😡", "😢", "👍", "👎", "🔥", "😂", "💀", "❤️"];

    document.querySelectorAll('.btn-react').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const chosenEmoji = prompt(`Choose an emoji reaction to toggle:\n\n${emojis.join(' ')}`);
            if (emojis.includes(chosenEmoji)) {
                const docRef = doc(db, "messages", id);
                const currentData = msgLookup[id];
                const updatedReactions = { ...(currentData.reactions || {}) };
                
                // Toggle action logic: If user clicks identical emoji twice, clear it. Else write update map field
                if (updatedReactions[currentUser.uid] === chosenEmoji) {
                    delete updatedReactions[currentUser.uid];
                } else {
                    updatedReactions[currentUser.uid] = chosenEmoji;
                }
                await updateDoc(docRef, { reactions: updatedReactions });
            }
        });
    });

    document.querySelectorAll('.btn-reply').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentReplyTargetId = e.target.dataset.id;
            replyTargetText.textContent = `"${e.target.dataset.text.substring(0, 20)}..."`;
            replyPreview.classList.remove('hidden');
            chatInput.focus();
        });
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (confirm("Are you sure you want to delete this message?")) {
                await deleteDoc(doc(db, "messages", e.target.dataset.id));
            }
        });
    });
}

document.getElementById('btn-cancel-reply').addEventListener('click', clearReplyState);
function clearReplyState() {
    currentReplyTargetId = null;
    replyPreview.classList.add('hidden');
}

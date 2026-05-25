// Using verified version-locked CDN packages
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// =============================================================
//      PASTE YOUR ACTUAL FIREBASE WEB CONSOLE API KEYS HERE:
// =============================================================
const firebaseConfig = {
    apiKey: "AIzaSyAJkaNYkFiINIAXMwaxNthUodZtVC9R7k0",
    authDomain: "crisp-flow.firebaseapp.com",
    projectId: "crisp-flow",
    storageBucket: "crisp-flow.firebasestorage.app",
    messagingSenderId: "680272368132",
    appId: "1:680272368132:web:08f23179dbf7afe4ef5b51"
};

// Initialize App References
console.log("Initializing Firebase Setup...");
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Runtime Cache Tracking States
let currentUser = null;
let currentReplyTargetId = null;
let messageLookupCache = {}; 

// Document Element DOM Registry
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');
const btnLogin = document.getElementById('btn-login');
const btnSignup = document.getElementById('btn-signup');
const btnLogout = document.getElementById('btn-logout');
const userDisplay = document.getElementById('user-display');
const chatBox = document.getElementById('chat-box');
const taskModal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const replyPreview = document.getElementById('reply-preview');
const replyTargetText = document.getElementById('reply-target-text');

// =============================================================
// 1. IMMEDIATE BUTTON EVENT LISTENERS (FOOLPROOF BINDING)
// =============================================================

// Auth UI Buttons
if (btnSignup) {
    btnSignup.addEventListener('click', async () => {
        console.log("Sign Up button clicked");
        if(!emailInput.value || !passwordInput.value) return alert("Please fill in auth details.");
        try {
            await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
            alert("Account registered inside Crisp Flow!");
        } catch (err) { alert(err.message); }
    });
}

if (btnLogin) {
    btnLogin.addEventListener('click', async () => {
        console.log("Log In button clicked");
        if(!emailInput.value || !passwordInput.value) return alert("Please fill in auth details.");
        try {
            await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
        } catch (err) { alert(err.message); }
    });
}

if (btnLogout) {
    btnLogout.addEventListener('click', () => {
        console.log("Logout button clicked");
        signOut(auth);
    });
}

// Modal Toggle Window Buttons
const btnOpenModal = document.getElementById('btn-open-task-modal');
if (btnOpenModal) {
    btnOpenModal.addEventListener('click', () => {
        console.log("Open Task Modal button clicked");
        taskModal.classList.remove('hidden');
    });
}

const btnCloseModal = document.getElementById('btn-close-modal');
if (btnCloseModal) {
    btnCloseModal.addEventListener('click', () => {
        console.log("Close Task Modal button clicked");
        taskModal.classList.add('hidden');
    });
}

// Navigation View Switcher Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        console.log("Tab clicked:", e.target.dataset.tab);
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        e.target.classList.add('active');
        document.getElementById(e.target.dataset.tab).classList.remove('hidden');
    });
});

// Reply State Dismiss Button
const btnCancelReply = document.getElementById('btn-cancel-reply');
if (btnCancelReply) {
    btnCancelReply.addEventListener('click', () => {
        console.log("Cancel reply button clicked");
        clearReplyState();
    });
}

// =============================================================
// 2. DATA SUBMISSION WRITE HANDLERS
// =============================================================

if (taskForm) {
    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("Task Form submitted");
        const taskData = {
            name: document.getElementById('task-name').value,
            priority: document.getElementById('task-priority').value,
            dueDate: document.getElementById('task-date').value,
            userId: currentUser.uid
        };
        try {
            await addDoc(collection(db, "tasks"), taskData);
            taskModal.classList.add('hidden');
            taskForm.reset();
        } catch(err) { alert(err.message); }
    });
}

if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log("Chat Form submitted");
        if (!chatInput.value.trim()) return;

        const msgPayload = {
            text: chatInput.value,
            senderEmail: currentUser.email,
            senderUid: currentUser.uid,
            timestamp: serverTimestamp(),
            reactions: {},
            replyTo: currentReplyTargetId
        };

        try {
            await addDoc(collection(db, "messages"), msgPayload);
            chatInput.value = "";
            clearReplyState();
        } catch (err) { alert(err.message); }
    });
}

// =============================================================
// 3. CORE REAL-TIME RENDERING PIPELINES
// =============================================================

onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("User session authenticated:", user.email);
        currentUser = user;
        userDisplay.textContent = user.email;
        authContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        initRealtimeSyncs();
    } else {
        console.log("No authenticated session found.");
        currentUser = null;
        authContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
});

function initRealtimeSyncs() {
    const priorityWeight = { high: 1, medium: 2, low: 3 };

    // Synced Activity Planner Tasks Listener
    onSnapshot(collection(db, "tasks"), (snapshot) => {
        let taskArray = [];
        snapshot.forEach(doc => {
            taskArray.push({ id: doc.id, ...doc.data() });
        });

        taskArray.sort((a, b) => {
            let dateDiff = new Date(a.dueDate) - new Date(b.dueDate);
            if (dateDiff !== 0) return dateDiff;
            return priorityWeight[a.priority] - priorityWeight[b.priority];
        });
        renderTasks(taskArray);
    });

    // Synced Real-time Team Chat Messages Listener
    const chatQuery = query(collection(db, "messages"), orderBy("timestamp", "asc"));
    onSnapshot(chatQuery, (snapshot) => {
        messageLookupCache = {};
        snapshot.forEach(doc => messageLookupCache[doc.id] = doc.data());
        renderChat(snapshot);
    });
}

function renderTasks(tasks) {
    const container = document.getElementById('task-list');
    if (!container) return;
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

function renderChat(snapshot) {
    if (!chatBox) return;
    chatBox.innerHTML = "";

    snapshot.forEach(docSnap => {
        const id = docSnap.id;
        const msg = docSnap.data();
        const isMe = msg.senderUid === currentUser.uid;

        const wrapper = document.createElement('div');
        wrapper.className = `msg-wrapper ${isMe ? 'outgoing' : 'incoming'}`;

        let reactionHTML = '';
        if (msg.reactions && Object.keys(msg.reactions).length > 0) {
            const counts = {};
            Object.values(msg.reactions).forEach(emoji => counts[emoji] = (counts[emoji] || 0) + 1);
            reactionHTML = `<div class="react-bar">` + Object.entries(counts).map(([em, cnt]) => `${em} ${cnt}`).join(' ') + `</div>`;
        }

        let replyHeaderHTML = '';
        if (msg.replyTo && messageLookupCache[msg.replyTo]) {
            replyHeaderHTML = `<div class="msg-reply-ref">↳ Replying to: "${messageLookupCache[msg.replyTo].text.substring(0,15)}..."</div>`;
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
}

// =============================================================
// 4. CHAT AREA EVENT DELEGATION
// =============================================================
if (chatBox) {
    chatBox.addEventListener('click', async (e) => {
        const target = e.target;
        if (!target.classList.contains('action-lnk')) return;

        const id = target.dataset.id;
        const emojis = ["😀", "😡", "😢", "👍", "👎", "🔥", "😂", "💀", "❤️"];

        // Reaction Control Panel
        if (target.classList.contains('btn-react')) {
            console.log("React action item clicked for message:", id);
            const chosenEmoji = prompt(`Choose an emoji reaction to toggle:\n\n${emojis.join(' ')}`);
            if (emojis.includes(chosenEmoji)) {
                const docRef = doc(db, "messages", id);
                const currentData = messageLookupCache[id];
                const updatedReactions = { ...(currentData.reactions || {}) };
                
                if (updatedReactions[currentUser.uid] === chosenEmoji) {
                    delete updatedReactions[currentUser.uid];
                } else {
                    updatedReactions[currentUser.uid] = chosenEmoji;
                }
                await updateDoc(docRef, { reactions: updatedReactions });
            }
        }

        // Thread Reply Setup
        if (target.classList.contains('btn-reply')) {
            console.log("Reply action item clicked for message:", id);
            currentReplyTargetId = id;
            replyTargetText.textContent = `"${target.dataset.text.substring(0, 20)}..."`;
            replyPreview.classList.remove('hidden');
            chatInput.focus();
        }

        // Message Purge Deletion Handler
        if (target.classList.contains('btn-delete')) {
            console.log("Delete action item clicked for message:", id);
            if (confirm("Are you sure you want to delete this message?")) {
                await deleteDoc(doc(db, "messages", id));
            }
        }
    });
}

function clearReplyState() {
    currentReplyTargetId = null;
    replyPreview.classList.add('hidden');
}

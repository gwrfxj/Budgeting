// ==============================
// Firebase Setup
// ==============================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, collection, addDoc, query, where, orderBy, onSnapshot, 
    deleteDoc, doc, getDocs, updateDoc, Timestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyBnvV981H5MwU25XPNNS1K1MKTGsY_1D7k",
    authDomain: "budgeting-app-58c5a.firebaseapp.com",
    projectId: "budgeting-app-58c5a",
    storageBucket: "budgeting-app-58c5a.firebasestorage.app",
    messagingSenderId: "738326299906",
    appId: "1:738326299906:web:28075b2e7c209eed25ee1b",
    measurementId: "G-2NN9B226DZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==============================
// Globals
// ==============================
window.currentUser = null;
window.transactions = [];
window.recurringTransactions = [];
window.currentFilter = "all";
window.currentTab = "dashboard";
window.chartPeriod = "week";
window.selectedType = "expense";
window.selectedRecurringType = "expense";
window.selectedFrequency = "weekly";
let unsubscribeTransactions = null;
let unsubscribeRecurring = null;
let financeChart = null;
let categoryChart = null;

// ==============================
// UI Helpers
// ==============================
function showLoading(show = true) {
    const el = document.getElementById("loadingOverlay");
    if (el) el.classList.toggle("active", show);
}
function showError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 5000);
}
function showSuccess(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 3000);
}
window.togglePassword = (id) => {
    const input = document.getElementById(id);
    if (input) input.type = input.type === "password" ? "text" : "password";
};

// ==============================
// Type & Frequency Selectors
// ==============================
window.selectType = (type) => {
    window.selectedType = type;
    document.getElementById("transactionType").value = type;
    document.getElementById("incomeBtn").classList.toggle("active", type === "income");
    document.getElementById("expenseBtn").classList.toggle("active", type === "expense");
};
window.selectRecurringType = (type) => {
    window.selectedRecurringType = type;
    document.getElementById("recurringType").value = type;
    document.getElementById("recurringIncomeBtn").classList.toggle("active", type === "income");
    document.getElementById("recurringExpenseBtn").classList.toggle("active", type === "expense");
};
window.selectFrequency = (freq, e) => {
    window.selectedFrequency = freq;
    document.getElementById("recurringFrequency").value = freq;
    document.querySelectorAll(".frequency-btn").forEach(b => b.classList.remove("active"));
    if (e) e.target.classList.add("active");
};

// ==============================
// Tabs
// ==============================
window.switchTab = (tab, e) => {
    window.currentTab = tab;
    document.querySelectorAll(".nav-tab").forEach(b => b.classList.remove("active"));
    if (e) e.target.classList.add("active");
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.getElementById(tab + "Tab").classList.add("active");
    if (tab === "analytics") setTimeout(initCharts, 100);
};

// ==============================
// Auth
// ==============================
window.handleLogin = async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const pw = document.getElementById("loginPassword").value;
    try {
        showLoading(true);
        await signInWithEmailAndPassword(auth, email, pw);
        showSuccess("loginSuccess", "Welcome back!");
    } catch {
        showError("loginError", "Invalid email or password");
    } finally { showLoading(false); }
};
window.handleSignup = async (e) => {
    e.preventDefault();
    const email = document.getElementById("signupEmail").value.trim();
    const pw = document.getElementById("signupPassword").value;
    const pw2 = document.getElementById("signupPasswordConfirm").value;
    if (pw !== pw2) return showError("signupError", "Passwords do not match");
    try {
        showLoading(true);
        await createUserWithEmailAndPassword(auth, email, pw);
        showSuccess("signupSuccess", "Account created!");
    } catch (err) {
        showError("signupError", err.message);
    } finally { showLoading(false); }
};
window.logout = async () => {
    if (!confirm("Logout?")) return;
    try { showLoading(true); await signOut(auth); }
    finally { showLoading(false); }
};

// ==============================
// Auth State
// ==============================
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.currentUser = user;
        showApp();
        loadTransactions();
        loadRecurring();
        processRecurringTransactions(); // 👈 auto-run recurring at login
    } else {
        window.currentUser = null;
        if (unsubscribeTransactions) unsubscribeTransactions();
        if (unsubscribeRecurring) unsubscribeRecurring();
        showAuth();
    }
});
function showAuth() {
    document.getElementById("authContainer").style.display = "block";
    document.getElementById("appContainer").style.display = "none";
    document.querySelector(".app-container").style.display = "none";
}
function showApp() {
    document.getElementById("authContainer").style.display = "none";
    document.getElementById("appContainer").style.display = "block";
    document.querySelector(".app-container").style.display = "block";
    document.getElementById("userEmail").textContent = window.currentUser.email;
}

// ==============================
// Transactions
// ==============================
window.handleAddTransaction = async (e) => {
    e.preventDefault();
    const type = document.getElementById("transactionType").value;
    const desc = document.getElementById("transactionDescription").value.trim();
    const amount = parseFloat(document.getElementById("transactionAmount").value);
    const cat = document.getElementById("transactionCategory").value;
    if (isNaN(amount)) return alert("Enter a valid amount.");
    try {
        showLoading(true);
        await addDoc(collection(db, "transactions"), {
            userId: window.currentUser.uid,
            type, description: desc, amount: amount, category: cat,
            timestamp: Timestamp.now(),
            createdAt: new Date().toISOString()
        });
        e.target.reset();
    } finally { showLoading(false); }
};
window.deleteTransaction = async (id) => {
    if (!confirm("Delete transaction?")) return;
    try { showLoading(true); await deleteDoc(doc(db, "transactions", id)); }
    finally { showLoading(false); }
};

// ==============================
// Recurring
// ==============================
window.openRecurringModal = () => document.getElementById("recurringModal").classList.add("active");
window.closeRecurringModal = () => document.getElementById("recurringModal").classList.remove("active");

window.handleAddRecurring = async (e) => {
    e.preventDefault();
    const frequency = document.getElementById("recurringFrequency").value;
    const type = document.getElementById("recurringType").value;
    const description = document.getElementById("recurringDescription").value;
    const amount = parseFloat(document.getElementById("recurringAmount").value);
    const category = document.getElementById("recurringCategory").value;
    const dayOfWeek = document.getElementById("recurringDay").value; // "monday"..."sunday" (optional)
    const today = new Date();

    if (isNaN(amount)) return alert("Enter a valid amount.");

    try {
        showLoading(true);
        await addDoc(collection(db, "recurring"), {
            userId: window.currentUser.uid,
            frequency, type, description, amount, category,
            dayOfWeek: dayOfWeek || null, // weekly/biweekly
            dayOfMonth: today.getDate(),  // monthly default
            month: today.getMonth() + 1,  // yearly default
            active: true,
            createdAt: today.toISOString(),
            lastProcessed: null
        });
        closeRecurringModal();
        e.target.reset();
        window.selectRecurringType("expense");
        window.selectFrequency("weekly");
    } finally { showLoading(false); }
};
window.deleteRecurring = async (id) => {
    if (!confirm("Delete recurring?")) return;
    try { showLoading(true); await deleteDoc(doc(db, "recurring", id)); }
    finally { showLoading(false); }
};

// ==============================
// Auto Recurring Processor (Improved)
// ==============================
async function processRecurringTransactions() {
    if (!window.currentUser) return;
    const today = new Date();
    const todayDay = today.toLocaleString("en-US", { weekday: "long" }).toLowerCase();
    const todayDate = today.toISOString().split("T")[0]; // YYYY-MM-DD

    const q = query(
        collection(db, "recurring"),
        where("userId", "==", window.currentUser.uid),
        where("active", "==", true)
    );
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
        const txn = docSnap.data();
        let shouldFire = false;

        // WEEKLY
        if (txn.frequency === "weekly" && txn.dayOfWeek === todayDay) {
            shouldFire = true;
        }

        // BIWEEKLY (anchored to createdAt week)
        if (txn.frequency === "biweekly" && txn.dayOfWeek === todayDay) {
            const created = new Date(txn.createdAt);
            const weeksSinceCreated = Math.floor((today - created) / (1000 * 60 * 60 * 24 * 7));
            if (weeksSinceCreated % 2 === 0) shouldFire = true;
        }

        // MONTHLY (on dayOfMonth)
        if (txn.frequency === "monthly" && txn.dayOfMonth) {
            if (today.getDate() === txn.dayOfMonth) shouldFire = true;
        }

        // YEARLY (on month + dayOfMonth)
        if (txn.frequency === "yearly" && txn.month && txn.dayOfMonth) {
            if ((today.getMonth() + 1) === txn.month && today.getDate() === txn.dayOfMonth) shouldFire = true;
        }

        // Fire if due and not processed today
        if (shouldFire && txn.lastProcessed !== todayDate) {
            await addDoc(collection(db, "transactions"), {
                userId: window.currentUser.uid,
                type: txn.type,
                description: txn.description,
                amount: txn.amount,
                category: txn.category,
                timestamp: Timestamp.now(),
                createdAt: new Date().toISOString()
            });
            await updateDoc(doc(db, "recurring", docSnap.id), { lastProcessed: todayDate });
        }
    }
}

// ==============================
// Firestore Listeners
// ==============================
function loadTransactions() {
    if (!window.currentUser) return;
    if (unsubscribeTransactions) unsubscribeTransactions();
    const qy = query(
        collection(db, "transactions"),
        where("userId", "==", window.currentUser.uid),
        orderBy("timestamp", "desc")
    );
    unsubscribeTransactions = onSnapshot(qy, (snap) => {
        window.transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateUI();
    });
}
function loadRecurring() {
    if (!window.currentUser) return;
    if (unsubscribeRecurring) unsubscribeRecurring();
    const qy = query(collection(db, "recurring"), where("userId", "==", window.currentUser.uid));
    unsubscribeRecurring = onSnapshot(qy, (snap) => {
        window.recurringTransactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        updateRecurringList();
    });
}

// ==============================
// UI Updates (Summary, Lists, Charts)
// ==============================
function updateUI() {
    updateSummary();
    updateTransactionsList();
    if (window.currentTab === "analytics") updateCharts();
}
function updateSummary() {
    let income = 0, expenses = 0;
    window.transactions.forEach(t => { if (t.type === "income") income += t.amount; else expenses += t.amount; });
    const balance = income - expenses;
    document.getElementById("totalIncome").textContent = `$${income.toFixed(2)}`;
    document.getElementById("totalExpenses").textContent = `$${expenses.toFixed(2)}`;
    document.getElementById("balance").textContent = `${balance >= 0 ? "$" : "-$"}${Math.abs(balance).toFixed(2)}`;
}
function updateTransactionsList() {
    const list = document.getElementById("transactionsList");
    let txns = window.transactions;
    if (window.currentFilter !== "all") txns = txns.filter(t => t.type === window.currentFilter);

    if (txns.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📝</div><h4>No transactions yet</h4><p>Add your first transaction</p></div>`;
        return;
    }

    const categoryIcons = {
        salary: "💼", investment: "📈", "other-income": "💰",
        food: "🍔", transportation: "🚗", shopping: "🛍️",
        entertainment: "🎬", bills: "📄", healthcare: "🏥",
        education: "📚", "other-expense": "📦"
    };

    list.innerHTML = txns.map((t, i) => {
        const date = t.timestamp ? new Date(t.timestamp.seconds * 1000) : new Date();
        const dStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const icon = categoryIcons[t.category] || "💰";
        return `
        <div class="transaction-item" style="animation-delay:${i * 0.05}s">
            <div class="transaction-info">
                <div class="transaction-icon ${t.type}">${icon}</div>
                <div class="transaction-details">
                    <div class="transaction-description">${t.description}</div>
                    <div class="transaction-meta"><span>${t.category.replace("-", " ")}</span><span>•</span><span>${dStr}</span></div>
                </div>
            </div>
            <div class="transaction-amount ${t.type}">${t.type === "income" ? "+" : "-"}$${t.amount.toFixed(2)}</div>
            <button class="delete-btn" onclick="deleteTransaction('${t.id}')">×</button>
        </div>`;
    }).join("");
}
function updateRecurringList() {
    const list = document.getElementById("recurringList");
    if (window.recurringTransactions.length === 0) {
        list.innerHTML = `<div class="empty-state"><p>No recurring transactions yet</p></div>`;
        return;
    }
    list.innerHTML = window.recurringTransactions.map(r => `
        <div class="recurring-item ${r.type}">
            <div class="recurring-info">
                <div class="recurring-details">
                    <div class="recurring-description">${r.description}</div>
                    <div class="recurring-amount">${r.type === "income" ? "+" : "-"}$${r.amount.toFixed(2)}</div>
                </div>
                <span class="recurring-frequency">${r.frequency}${r.dayOfWeek ? " • " + r.dayOfWeek.charAt(0).toUpperCase() + r.dayOfWeek.slice(1) : ""}</span>
            </div>
            <button class="delete-btn" onclick="deleteRecurring('${r.id}')">×</button>
        </div>
    `).join("");
}
    // ==============================
    // Filters (Dashboard)
    // ==============================
    window.filterTransactions = (filter, e) => {
        window.currentFilter = filter;

        // update active button UI
        document.querySelectorAll(".filter-btn").forEach(btn => btn.classList.remove("active"));
        if (e) e.target.classList.add("active");

        updateTransactionsList();
    };

    // ==============================
    // Chart Period Controls (Analytics)
    // ==============================
    window.updateChartPeriod = (period, e) => {
        window.chartPeriod = period;

        // update active button UI
        document.querySelectorAll(".chart-control-btn").forEach(btn => btn.classList.remove("active"));
        if (e) e.target.classList.add("active");

        updateCharts();
    };

// ==============================
// Charts
// ==============================
function initCharts() {
    const ctx1 = document.getElementById("financeChart");
    const ctx2 = document.getElementById("categoryChart");
    if (!ctx1 || !ctx2) return;
    if (financeChart) financeChart.destroy();
    if (categoryChart) categoryChart.destroy();

    // Expect Chart.js to be loaded globally via <script> in index.html
    financeChart = new Chart(ctx1, {
        type: "line",
        data: { 
            labels: [], 
            datasets: [
                { label:"Income", data:[], borderColor:"#10B981", backgroundColor:"rgba(16,185,129,0.1)", tension:0.4 },
                { label:"Expenses", data:[], borderColor:"#EF4444", backgroundColor:"rgba(239,68,68,0.1)", tension:0.4 },
                { label:"Net Balance", data:[], borderColor:"#FFD700", backgroundColor:"rgba(255,215,0,0.1)", tension:0.4 }
            ]
        },
        options: { responsive:true, maintainAspectRatio:false }
    });

    categoryChart = new Chart(ctx2, {
        type:"doughnut",
        data:{ labels:[], datasets:[{ data:[], backgroundColor:["#FFD700","#9333EA","#10B981","#EF4444","#3B82F6","#F59E0B","#EC4899","#8B5CF6"] }] },
        options:{ responsive:true, maintainAspectRatio:false }
    });

    updateCharts();
}
function updateCharts() {
    if (!financeChart || !categoryChart) return;

    const now = new Date();
    const grouped = {};

    window.transactions.forEach(t => {
        const date = new Date(t.timestamp.seconds * 1000);

        // filter by selected period
        if (window.chartPeriod === "week") {
            const weekAgo = new Date();
            weekAgo.setDate(now.getDate() - 7);
            if (date < weekAgo) return;
        } else if (window.chartPeriod === "month") {
            const monthAgo = new Date();
            monthAgo.setMonth(now.getMonth() - 1);
            if (date < monthAgo) return;
        } else if (window.chartPeriod === "year") {
            const yearAgo = new Date();
            yearAgo.setFullYear(now.getFullYear() - 1);
            if (date < yearAgo) return;
        }

        const dStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        if (!grouped[dStr]) grouped[dStr] = { income: 0, expenses: 0 };

        if (t.type === "income") grouped[dStr].income += t.amount;
        else grouped[dStr].expenses += t.amount;
    });

    // update line chart
    const dates = Object.keys(grouped).sort();
    financeChart.data.labels = dates;
    financeChart.data.datasets[0].data = dates.map(d => grouped[d].income);
    financeChart.data.datasets[1].data = dates.map(d => grouped[d].expenses);
    financeChart.data.datasets[2].data = dates.map(d => grouped[d].income - grouped[d].expenses);
    financeChart.update();

    // update category chart (only expenses)
    const catTotals = {};
    window.transactions.forEach(t => {
        const date = new Date(t.timestamp.seconds * 1000);

        // apply same period filter
        if (window.chartPeriod === "week") {
            const weekAgo = new Date();
            weekAgo.setDate(now.getDate() - 7);
            if (date < weekAgo) return;
        } else if (window.chartPeriod === "month") {
            const monthAgo = new Date();
            monthAgo.setMonth(now.getMonth() - 1);
            if (date < monthAgo) return;
        } else if (window.chartPeriod === "year") {
            const yearAgo = new Date();
            yearAgo.setFullYear(now.getFullYear() - 1);
            if (date < yearAgo) return;
        }

        if (t.type === "expense") {
            catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
        }
    });

    categoryChart.data.labels = Object.keys(catTotals);
    categoryChart.data.datasets[0].data = Object.values(catTotals);
    categoryChart.update();
}

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
    deleteDoc, doc, getDocs, updateDoc, Timestamp, setDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase config (kept exactly as you had it)
const firebaseConfig = {
    apiKey: "AIzaSyBnvV981H5MwU25XPNNS1K1MKTGsY_1D7k",
    authDomain: "budgeting-app-58c5a.firebaseapp.com",
    projectId: "budgeting-app-58c5a",
    storageBucket: "budgeting-app-58c5a.firebasestorage.app",
    messagingSenderId: "738326299906",
    appId: "1:738326299906:web:28075b2e7c209eed25ee1b",
    measurementId: "G-2NN9B226DZ"
};

// Initialize Firebase (kept)
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
window.currentBudget = null;
window.currentSavings = null;
let unsubscribeBudget = null;
let unsubscribeSavings = null;
let categoryChart = null;

// ★ CHANGE: constants for list caps
const DASHBOARD_RECENT_LIMIT = 10;
const BUDGET_RECENT_LIMIT = 10;

// Rollover message (transient UI hint on Dashboard)
window.__rolloverAmount = 0;        // how much we moved to savings
window.__rolloverNoteUntil = 0;     // unix ms until when we show the note


// ---- Helpers (added) ----
function tsToMs(ts) {
  // Accept Firestore Timestamp, {seconds:n}, millis number, ISO string, Date
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  if (typeof ts === "number") return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === "string") {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

function startOfMonthMs(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

async function ensureDoc(pathSegments, initData) {
  // Example: ensureDoc(["savings", uid], { userId: uid, totalSavings: 0 })
  const ref = doc(db, ...pathSegments);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, initData, { merge: true });
  }
  return ref;
}

function showFriendlyError(id, err, fallbackMsg) {
  console.error(fallbackMsg, err);
  showError(id, `${fallbackMsg}${err?.code ? ` (${err.code})` : ""}`);
}

function announceRollover(amount) {
  window.__rolloverAmount = Number(amount) || 0;
  // show the note for 15 seconds
  window.__rolloverNoteUntil = Date.now() + 15000;
}



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
window.showLogin = () => {
    document.getElementById("loginForm").classList.remove("hidden");
    document.getElementById("signupForm").classList.add("hidden");
};
window.showSignup = () => {
    document.getElementById("signupForm").classList.remove("hidden");
    document.getElementById("loginForm").classList.add("hidden");
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
        loadBudget();  // Add this
        loadSavings(); // Add this
        processRecurringTransactions();
        processMonthlyReset(); // Add this
    } else {
        window.currentUser = null;
        if (unsubscribeTransactions) unsubscribeTransactions();
        if (unsubscribeRecurring) unsubscribeRecurring();
        if (unsubscribeBudget) unsubscribeBudget();  // Add this
        if (unsubscribeSavings) unsubscribeSavings(); // Add this
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
window.deleteTransaction = async (id, e) => {
  try {
    if (e) e.stopPropagation();
    if (!confirm("Delete transaction?")) return;

    showLoading(true);
    await deleteDoc(doc(db, "transactions", id)); // fast path
  } catch (err) {
    // If it failed due to legacy ownership, try to claim then retry once
    if (err?.code === "permission-denied") {
      try {
        const claimed = await claimLegacyTransactionIfNeeded(id);
        if (claimed) {
          await deleteDoc(doc(db, "transactions", id));
          return; // success after claim
        }
      } catch (innerErr) {
        console.error("Claim failed:", innerErr);
      }
    }
    console.error("Delete failed:", err);
    showFriendlyError("signupError", err, "Failed to delete transaction.");
    alert(`Failed to delete transaction${err?.code ? ` (${err.code})` : ""}.`);
  } finally {
    showLoading(false);
  }
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
window.deleteRecurring = async (id, e) => {
  try {
    if (e) e.stopPropagation();
    if (!confirm("Delete recurring?")) return;

    showLoading(true);
    await deleteDoc(doc(db, "recurring", id));
  } catch (err) {
    if (err?.code === "permission-denied") {
      try {
        const claimed = await claimLegacyRecurringIfNeeded(id);
        if (claimed) {
          await deleteDoc(doc(db, "recurring", id));
          return;
        }
      } catch (innerErr) {
        console.error("Claim recurring failed:", innerErr);
      }
    }
    console.error("Delete recurring failed:", err);
    showFriendlyError("signupError", err, "Failed to delete recurring.");
    alert(`Failed to delete recurring${err?.code ? ` (${err.code})` : ""}.`);
  } finally {
    showLoading(false);
  }
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
// Budget & Savings Management
// ==============================
window.openBudgetModal = () => document.getElementById("budgetModal").classList.add("active");
window.closeBudgetModal = () => document.getElementById("budgetModal").classList.remove("active");

window.handleSetBudget = async (e) => {
  e.preventDefault();
  const monthlyLimit = parseFloat(document.getElementById("monthlyBudgetLimit").value);
  if (isNaN(monthlyLimit)) return alert("Enter a valid amount.");

  try {
    showLoading(true);
    const uid = window.currentUser?.uid;
    if (!uid) throw new Error("not-signed-in");

    // make sure the doc exists first, then merge
    const budgetRef = await ensureDoc(["budgets", uid], {
      userId: uid,
      monthlyLimit: 0,
      lastResetDate: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });

    await setDoc(budgetRef, {
      userId: uid,
      monthlyLimit,
      lastResetDate: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });

    closeBudgetModal();
    e.target.reset();
    loadBudget();
  } catch (err) {
    showFriendlyError("signupError", err, "Failed to set budget.");
    alert("Failed to set budget. Please try again.");
  } finally {
    showLoading(false);
  }
};

window.handleUpdateSavings = async (e) => {
  e.preventDefault();
  const newSavings = parseFloat(document.getElementById("savingsAmount").value);
  if (isNaN(newSavings)) return alert("Enter a valid amount.");

  try {
    showLoading(true);
    const uid = window.currentUser?.uid;
    if (!uid) throw new Error("not-signed-in");

    const savingsRef = await ensureDoc(["savings", uid], {
      userId: uid,
      totalSavings: 0,
      autoAddBalance: false,
      createdAt: new Date().toISOString()
    });

    await setDoc(savingsRef, {
      userId: uid,
      totalSavings: newSavings,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    closeSavingsModal();
    e.target.reset();
    loadSavings();
  } catch (err) {
    showFriendlyError("signupError", err, "Failed to update savings.");
    alert("Failed to update savings. Please try again.");
  } finally {
    showLoading(false);
  }
};
window.toggleAutoSavings = async (checkbox) => {
  try {
    showLoading(true);
    const uid = window.currentUser?.uid;
    if (!uid) throw new Error("not-signed-in");

    const savingsRef = await ensureDoc(["savings", uid], {
      userId: uid,
      totalSavings: 0,
      autoAddBalance: false,
      createdAt: new Date().toISOString()
    });

    await setDoc(savingsRef, {
      autoAddBalance: !!checkbox.checked,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    checkbox.checked = !checkbox.checked; // revert UI on failure
    showFriendlyError("signupError", err, "Failed to update auto-save setting.");
    alert("Failed to update auto-save setting.");
  } finally {
    showLoading(false);
  }
};

async function processMonthlyReset() {
  if (!window.currentUser || !window.currentBudget) return;

  const today = new Date();
  const lastReset = new Date(window.currentBudget.lastResetDate || 0);

  // If we’re in a new month, handle rollover
  const isNewMonth =
    today.getMonth() !== lastReset.getMonth() ||
    today.getFullYear() !== lastReset.getFullYear();

  if (!isNewMonth) return;

  try {
    // Only move leftover if auto-add is enabled
    const autoAdd = !!window.currentSavings?.autoAddBalance;

    if (autoAdd) {
      // Compute LAST MONTH net balance
      let income = 0, expenses = 0;
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      window.transactions.forEach(t => {
        // support Firestore Timestamp or createdAt ISO
        const tsMs =
          (t.timestamp?.seconds ? t.timestamp.seconds * 1000 : null) ??
          (typeof t.createdAt === "string" ? new Date(t.createdAt).getTime() : null);
        if (!tsMs) return;
        const td = new Date(tsMs);
        if (td >= lastMonthStart && td < thisMonthStart) {
          if (t.type === "income") income += Number(t.amount) || 0;
          else if (t.type === "expense") expenses += Number(t.amount) || 0;
        }
      });

      const netBalance = income - expenses;

      // Only add positive leftover to savings
      if (netBalance > 0) {
        const savingsRef = doc(db, "savings", window.currentUser.uid);
        // Read current to get the latest total, then add
        const snap = await getDoc(savingsRef);
        const currentTotal = snap.exists() ? (Number(snap.data().totalSavings) || 0) : 0;

        await setDoc(
          savingsRef,
          {
            totalSavings: currentTotal + netBalance,
            lastUpdated: new Date().toISOString()
          },
          { merge: true }
        );

        // 🔔 show the dashboard hint: "-$322.00 (Added to Savings)"
        announceRollover(netBalance);
      }
    }

    // Update budget reset marker so we don’t re-run this again this month
    const budgetRef = doc(db, "budgets", window.currentUser.uid);
    await setDoc(budgetRef, { lastResetDate: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.error("Monthly rollover failed:", err);
    // Silent fail; app keeps working
  }
}

// ---- Legacy claim helpers: attach userId once for old docs ----
async function claimLegacyTransactionIfNeeded(id) {
  const ref = doc(db, "transactions", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;

  const data = snap.data();
  const owner = data?.userId;

  // already owned by current user
  if (owner === window.currentUser.uid) return false;

  // only claim when empty/missing/invalid
  if (owner == null || owner === "" || typeof owner !== "string") {
    await setDoc(ref, { userId: window.currentUser.uid }, { merge: true });
    return true;
  }
  return false; // belongs to someone else → do nothing
}

async function claimLegacyRecurringIfNeeded(id) {
  const ref = doc(db, "recurring", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;

  const data = snap.data();
  const owner = data?.userId;

  if (owner === window.currentUser.uid) return false;
  if (owner == null || owner === "" || typeof owner !== "string") {
    await setDoc(ref, { userId: window.currentUser.uid }, { merge: true });
    return true;
  }
  return false;
}

function loadBudget() {
    if (!window.currentUser) return;
    const budgetRef = doc(db, "budgets", window.currentUser.uid);
    if (unsubscribeBudget) unsubscribeBudget();
    unsubscribeBudget = onSnapshot(budgetRef, (snap) => {
        if (snap.exists()) {
            window.currentBudget = snap.data();
            updateBudgetDisplay();
        } else {
            window.currentBudget = null;
            updateBudgetDisplay();
        }
    }, (error) => {
        console.error("Error loading budget:", error);
    });
}

function loadSavings() {
    if (!window.currentUser) return;
    const savingsRef = doc(db, "savings", window.currentUser.uid);
    if (unsubscribeSavings) unsubscribeSavings();
    unsubscribeSavings = onSnapshot(savingsRef, (snap) => {
        if (snap.exists()) {
            window.currentSavings = snap.data();
            updateSavingsDisplay();
            // Update toggle state
            const toggle = document.getElementById("autoSavingsToggle");
            if (toggle) toggle.checked = window.currentSavings.autoAddBalance || false;
        } else {
            window.currentSavings = { totalSavings: 0, autoAddBalance: false };
            updateSavingsDisplay();
        }
    }, (error) => {
        console.error("Error loading savings:", error);
    });
}

function updateBudgetDisplay() {
  // Compute this month's expenses robustly (supports Timestamp OR createdAt)
  const nowMs = Date.now();
  const monthStart = startOfMonthMs(new Date(nowMs));

  let monthlyExpenses = 0;
  for (const t of window.transactions) {
    if (t.type !== "expense") continue;
    const tMs = tsToMs(t.timestamp) ?? tsToMs(t.createdAt);
    if (tMs != null && tMs >= monthStart) {
      monthlyExpenses += Number(t.amount) || 0;
    }
  }

  document.getElementById("monthlyExpenses").textContent = `$${monthlyExpenses.toFixed(2)}`;

  // If no budget set, keep your “Not Set” UI
  if (!window.currentBudget || isNaN(Number(window.currentBudget.monthlyLimit))) {
    document.getElementById("budgetRemaining").textContent = "Not Set";
    const bar = document.getElementById("budgetBar");
    if (bar) bar.style.width = "0%";
    updateBudgetTransactionsList(); // still update the list
    return;
  }

  // Remaining + progress
  const limit = Number(window.currentBudget.monthlyLimit) || 0;
  const remaining = limit - monthlyExpenses;
  document.getElementById("budgetRemaining").textContent =
    remaining >= 0 ? `$${remaining.toFixed(2)}` : `-$${Math.abs(remaining).toFixed(2)}`;

  const pct = limit > 0 ? Math.min(100, (monthlyExpenses / limit) * 100) : 0;
  const bar = document.getElementById("budgetBar");
  if (bar) {
    bar.style.width = `${pct}%`;
    if (pct > 90) bar.style.background = "var(--red)";
    else if (pct > 70) bar.style.background = "var(--gold)";
    else bar.style.background = "var(--green)";
  }

  updateBudgetTransactionsList(); // you already merged “expenses only, max 10”
}


// ★ CHANGE: helper to format a txn row with your exact styles/classes
function renderTxnRow(t, i) {
    const categoryIcons = {
        salary: "💼", investment: "📈", "other-income": "💰",
        food: "🍔", transportation: "🚗", shopping: "🛍️",
        entertainment: "🎬", bills: "📄", healthcare: "🏥",
        education: "📚", "other-expense": "📦"
    };
    const ms = tsToMs(t.timestamp) ?? tsToMs(t.createdAt) ?? Date.now();
    const date = new Date(ms);
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
        <button type="button" class="delete-btn" onclick="deleteTransaction('${t.id}', event)">×</button>
    </div>`;
}

function updateBudgetTransactionsList() {
    const list = document.getElementById("budgetTransactionsList");
    if (!list) return;

    // ★ CHANGE: expenses only, already sorted desc by Firestore, then cap to 10
    const recentExpenses = window.transactions
    .filter(t => t.type === "expense" && !t.isSystem && t.category !== "__rollover__")
    .slice(0, BUDGET_RECENT_LIMIT);


    
    if (recentExpenses.length === 0) {
        list.innerHTML = `<div class="empty-state"><p>No transactions yet</p></div>`;
        return;
    }
    list.innerHTML = recentExpenses.map(renderTxnRow).join("");
}

function updateSavingsDisplay() {
    const savings = window.currentSavings?.totalSavings || 0;
    document.getElementById("totalSavings").textContent = `$${savings.toFixed(2)}`;
}

window.openSavingsModal = () => document.getElementById("savingsModal").classList.add("active");
window.closeSavingsModal = () => document.getElementById("savingsModal").classList.remove("active");

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
    updateBudgetDisplay(); // keeps budget in sync
    if (window.currentTab === "analytics") updateCharts();
}

function updateSummary() {
  let income = 0, expenses = 0;
  window.transactions.forEach(t => {
    if (t.type === "income") income += Number(t.amount) || 0;
    else expenses += Number(t.amount) || 0;
  });
  const balance = income - expenses;

  // Normal totals
  document.getElementById("totalIncome").textContent = `$${income.toFixed(2)}`;
  document.getElementById("totalExpenses").textContent = `$${expenses.toFixed(2)}`;

  const balanceEl = document.getElementById("balance");

  // If we just rolled over, show the explicit message for ~15s
  if (Date.now() < window.__rolloverNoteUntil && window.__rolloverAmount > 0) {
    const amt = window.__rolloverAmount.toFixed(2);
    // Text only; no class/style changes so visuals remain identical
    balanceEl.textContent = `-$${amt} (Added to Savings)`;
  } else {
    balanceEl.textContent = `${balance >= 0 ? "$" : "-$"}${Math.abs(balance).toFixed(2)}`;
  }
}


function updateTransactionsList() {
    const list = document.getElementById("transactionsList");
    let txns = window.transactions.filter(t => !t.isSystem && t.category !== "__rollover__");
    if (window.currentFilter !== "all") txns = txns.filter(t => t.type === window.currentFilter);

    // ★ CHANGE: cap to latest 10 for dashboard list
    txns = txns.slice(0, DASHBOARD_RECENT_LIMIT);

    if (txns.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📝</div><h4>No transactions yet</h4><p>Add your first transaction</p></div>`;
        return;
    }

    list.innerHTML = txns.map(renderTxnRow).join("");
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
            <button type="button" class="delete-btn" onclick="deleteRecurring('${r.id}', event)">×</button>
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
// Charts (kept as-is)
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
        const ms = tsToMs(t.timestamp) ?? tsToMs(t.createdAt);
        if (ms == null) return;  // skip if we can’t parse
        const date = new Date(ms);

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
        const ms = tsToMs(t.timestamp) ?? tsToMs(t.createdAt);
        if (ms == null) return;  // skip if we can’t parse
        const date = new Date(ms);

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

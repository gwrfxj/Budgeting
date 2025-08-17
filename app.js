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

// ★ constants for list caps
const DASHBOARD_RECENT_LIMIT = 10;
const BUDGET_RECENT_LIMIT = 10;

// Yearly reset guard (run once after both budget & savings are loaded)
let __yearResetRan = false;

// Rollover message (transient UI hint on Dashboard)
window.__rolloverAmount = 0;
window.__rolloverNoteUntil = 0;

// ---- Helpers ----
function tsToMs(ts) {
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
  const amt = Number(amount) || 0;
  window.__rolloverAmount = amt;
  window.__rolloverMessage =
    amt > 0 ? `+$${amt.toFixed(2)} (Added to Savings)` : `No leftover to add to Savings`;
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

function updateRolloverNote() {
  const el = document.getElementById("rolloverNote");
  if (!el) return;
  if (Date.now() < (window.__rolloverNoteUntil || 0) && window.__rolloverMessage) {
    el.textContent = window.__rolloverMessage;
  } else {
    el.textContent = "";
  }
}

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

/* Why: keeps desktop tabs, content panes, and mobile bottom nav in sync */
window.switchTab = (tab, e) => {
  window.currentTab = tab;

  // Desktop tabs
  document.querySelectorAll(".nav-tab").forEach(b => b.classList.remove("active"));
  if (e && e.target && e.target.classList.contains("nav-tab")) {
    e.target.classList.add("active");
  } else {
    const desktopBtn = document.querySelector(`.nav-tab[onclick*="${tab}"]`);
    if (desktopBtn) desktopBtn.classList.add("active");
  }

  // Content panes
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  const pane = document.getElementById(`${tab}Tab`);
  if (pane) pane.classList.add("active");

  // Mobile bottom nav sync (requires #mb-nav-*)
  ["dashboard", "budget", "recurring", "analytics"].forEach(id => {
    const el = document.getElementById(`mb-nav-${id}`);
    if (el) el.classList.toggle("active", id === tab);
  });

  // Ensure charts render after layout
  if (tab === "analytics" && typeof initCharts === "function") {
    setTimeout(initCharts, 100);
  }
};

// =========================
// Keep mobile bottom nav highlighted on first load/refresh
// Place this once in the file (after the function is fine).
// =========================
window.addEventListener("DOMContentLoaded", () => {
  const activePaneId =
    document.querySelector(".tab-content.active")?.id?.replace("Tab", "") ||
    "dashboard";

  ["dashboard", "budget", "recurring", "analytics"].forEach(id => {
    const el = document.getElementById(`mb-nav-${id}`);
    if (el) el.classList.toggle("active", id === activePaneId);
  });
});

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
        loadBudget();    // listen + hydrate toggles
        loadSavings();   // listen + hydrate savings/goal
        processRecurringTransactions();
        processMonthlyReset();
    } else {
        window.currentUser = null;
        if (unsubscribeTransactions) unsubscribeTransactions();
        if (unsubscribeRecurring) unsubscribeRecurring();
        if (unsubscribeBudget) unsubscribeBudget();
        if (unsubscribeSavings) unsubscribeSavings();
        __yearResetRan = false; // reset guard
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

  const typeEl = document.getElementById("transactionType");
  const descEl = document.getElementById("transactionDescription");
  const amtEl  = document.getElementById("transactionAmount");
  const catEl  = document.getElementById("transactionCategory");
  const addBtn = document.getElementById("addTxBtn");
  const amountHint = document.getElementById("amountHint");

  const type   = typeEl.value;
  const desc   = (descEl.value || "").trim();
  const amount = parseFloat(amtEl.value);
  const cat    = catEl.value;

  // show inline hint instead of popup
  const badAmount = isNaN(amount) || amount <= 0;
  amountHint.style.display = badAmount ? "inline" : "none";

  // block if invalid or category still the placeholder
  if (!desc || badAmount || !cat) {
    if (!cat) {
      toast('Select a category');
      catEl.focus();
    } else if (badAmount) {
      // hint already shows next to amount, no popup needed
      amtEl.focus();
    } else {
      toast('Enter a description');
      descEl.focus();
    }
    return;
}
  try {
    showLoading(true);
    await addDoc(collection(db, "transactions"), {
      userId: window.currentUser.uid,
      type, description: desc, amount, category: cat,
      timestamp: Timestamp.now(),
      createdAt: new Date().toISOString()
    });

    // reset form and state
    e.target.reset();
  } finally {
    showLoading(false);
  }

  // after reset, keep button disabled again
  if (typeof refreshAddState === "function") refreshAddState();
};
// Enable the "Add Transaction" button only when all fields are valid
const addTxBtn   = document.getElementById("addTxBtn");
const txDesc     = document.getElementById("transactionDescription");
const txAmount   = document.getElementById("transactionAmount");
const txCategory = document.getElementById("transactionCategory");
const amountHint = document.getElementById("amountHint");

function refreshAddState() {
  const amountVal = parseFloat(txAmount.value);
  const ok =
    (txDesc.value || "").trim().length > 0 &&
    !isNaN(amountVal) && amountVal > 0 &&
    !!txCategory.value;

  addTxBtn.disabled = !ok;
  amountHint.style.display = (!isNaN(amountVal) && amountVal > 0) ? "none" : "inline";
}

// keep it updated as the user types/changes
["input","change"].forEach(evt => {
  [txDesc, txAmount, txCategory].forEach(el => el && el.addEventListener(evt, refreshAddState));
});
refreshAddState();

window.deleteTransaction = async (id, e) => {
  try {
    if (e) e.stopPropagation();
    if (!confirm("Delete transaction?")) return;
    showLoading(true);
    await deleteDoc(doc(db, "transactions", id));
  } catch (err) {
    if (err?.code === "permission-denied") {
      try {
        const claimed = await claimLegacyTransactionIfNeeded(id);
        if (claimed) {
          await deleteDoc(doc(db, "transactions", id));
          return;
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

  function toast(msg){
    const t = document.getElementById('toast');
    if(!t){ alert(msg); return; }  // fallback if the toast element is missing
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(()=> t.classList.remove('show'), 2500);
  }
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
    const dayOfWeek = document.getElementById("recurringDay").value;
    const today = new Date();

    if (isNaN(amount)) return alert("Enter a valid amount.");

    try {
        showLoading(true);
        await addDoc(collection(db, "recurring"), {
            userId: window.currentUser.uid,
            frequency, type, description, amount, category,
            dayOfWeek: dayOfWeek || null,
            dayOfMonth: today.getDate(),
            month: today.getMonth() + 1,
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
// Auto Recurring Processor
// ==============================
async function processRecurringTransactions() {
    if (!window.currentUser) return;
    const today = new Date();
    const todayDay = today.toLocaleString("en-US", { weekday: "long" }).toLowerCase();
    const todayDate = today.toISOString().split("T")[0];

    const q = query(
        collection(db, "recurring"),
        where("userId", "==", window.currentUser.uid),
        where("active", "==", true)
    );
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
        const txn = docSnap.data();
        let shouldFire = false;

        if (txn.frequency === "weekly" && txn.dayOfWeek === todayDay) shouldFire = true;
        if (txn.frequency === "biweekly" && txn.dayOfWeek === todayDay) {
            const created = new Date(txn.createdAt);
            const weeksSinceCreated = Math.floor((today - created) / (1000 * 60 * 60 * 24 * 7));
            if (weeksSinceCreated % 2 === 0) shouldFire = true;
        }
        if (txn.frequency === "monthly" && txn.dayOfMonth) {
            if (today.getDate() === txn.dayOfMonth) shouldFire = true;
        }
        if (txn.frequency === "yearly" && txn.month && txn.dayOfMonth) {
            if ((today.getMonth() + 1) === txn.month && today.getDate() === txn.dayOfMonth) shouldFire = true;
        }

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

    const budgetRef = await ensureDoc(["budgets", uid], {
      userId: uid,
      monthlyLimit: 0,
      yearResetTx: false,          // NEW: default
      yearResetSavings: false,     // NEW: default
      lastResetYear: new Date().getFullYear(), // NEW: default
      lastResetDate: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });

    await setDoc(budgetRef, {
      userId: uid,
      monthlyLimit,
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
      savingsGoal: 0,            // NEW: default
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

// Savings Goal modal (NEW)
window.openSavingsGoalModal = () => document.getElementById("savingsGoalModal").classList.add("active");
window.closeSavingsGoalModal = () => document.getElementById("savingsGoalModal").classList.remove("active");

window.handleUpdateSavingsGoal = async (e) => {
  e.preventDefault();
  const v = parseFloat(document.getElementById("savingsGoalInput").value);
  if (isNaN(v) || v < 0) return alert("Enter a valid goal.");
  try {
    showLoading(true);
    const uid = window.currentUser?.uid;
    const ref = await ensureDoc(["savings", uid], {
      userId: uid, totalSavings: 0, savingsGoal: 0, autoAddBalance: false, createdAt: new Date().toISOString()
    });
    await setDoc(ref, { savingsGoal: v, updatedAt: new Date().toISOString() }, { merge: true });
    closeSavingsGoalModal();
    e.target.reset();
  } catch (err) {
    showFriendlyError("signupError", err, "Failed to save savings goal.");
  } finally {
    showLoading(false);
  }
};

// Toggle: auto-add
window.toggleAutoSavings = async (checkbox) => {
  try {
    showLoading(true);
    const uid = window.currentUser?.uid;
    if (!uid) throw new Error("not-signed-in");

    const savingsRef = await ensureDoc(["savings", uid], {
      userId: uid,
      totalSavings: 0,
      savingsGoal: 0,
      autoAddBalance: false,
      createdAt: new Date().toISOString()
    });

    await setDoc(savingsRef, {
      autoAddBalance: !!checkbox.checked,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    checkbox.checked = !checkbox.checked;
    showFriendlyError("signupError", err, "Failed to update auto-save setting.");
    alert("Failed to update auto-save setting.");
  } finally {
    showLoading(false);
  }
};

// NEW: Toggles for yearly resets
window.toggleYearResetTransactions = async (el) => {
  try {
    showLoading(true);
    const uid = window.currentUser?.uid;
    const ref = await ensureDoc(["budgets", uid], {
      userId: uid,
      monthlyLimit: 0,
      yearResetTx: false,
      yearResetSavings: false,
      lastResetYear: new Date().getFullYear(),
      createdAt: new Date().toISOString()
    });
    await setDoc(ref, { yearResetTx: !!el.checked, updatedAt: new Date().toISOString() }, { merge: true });
    updateUI(); // refresh totals with filter
  } catch (err) {
    el.checked = !el.checked;
    showFriendlyError("signupError", err, "Failed to update yearly reset setting.");
  } finally {
    showLoading(false);
  }
};

window.toggleYearResetSavings = async (el) => {
  try {
    showLoading(true);
    const uid = window.currentUser?.uid;
    const ref = await ensureDoc(["budgets", uid], {
      userId: uid,
      monthlyLimit: 0,
      yearResetTx: false,
      yearResetSavings: false,
      lastResetYear: new Date().getFullYear(),
      createdAt: new Date().toISOString()
    });
    await setDoc(ref, { yearResetSavings: !!el.checked, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    el.checked = !el.checked;
    showFriendlyError("signupError", err, "Failed to update yearly reset setting.");
  } finally {
    showLoading(false);
  }
};

async function processMonthlyReset() {
  if (!window.currentUser || !window.currentBudget) return;

  const today = new Date();
  const lastReset = new Date(window.currentBudget.lastResetDate || 0);

  const isNewMonth =
    today.getMonth() !== lastReset.getMonth() ||
    today.getFullYear() !== lastReset.getFullYear();

  if (!isNewMonth) return;

  try {
    const autoAdd = !!window.currentSavings?.autoAddBalance;

    if (autoAdd) {
      let income = 0, expenses = 0;
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      window.transactions.forEach(t => {
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

      if (netBalance > 0) {
        const savingsRef = doc(db, "savings", window.currentUser.uid);
        const snap = await getDoc(savingsRef);
        const currentTotal = snap.exists() ? (Number(snap.data().totalSavings) || 0) : 0;

        await setDoc(
          savingsRef,
          { totalSavings: currentTotal + netBalance, lastUpdated: new Date().toISOString() },
          { merge: true }
        );

        announceRollover(netBalance);
      }
    }

    const budgetRef = doc(db, "budgets", window.currentUser.uid);
    await setDoc(budgetRef, { lastResetDate: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.error("Monthly rollover failed:", err);
  }
}

// NEW: Yearly reset (savings zero-out on Jan 1 if enabled; no txn deletion)
async function tryProcessYearlyReset() {
  if (__yearResetRan) return;
  if (!window.currentUser || !window.currentBudget || !window.currentSavings) return;

  const nowYear = new Date().getFullYear();
  const last = Number(window.currentBudget.lastResetYear) || nowYear;

  if (nowYear > last) {
    try {
      if (window.currentBudget.yearResetSavings) {
        const savingsRef = doc(db, "savings", window.currentUser.uid);
        await setDoc(savingsRef, { totalSavings: 0, updatedAt: new Date().toISOString() }, { merge: true });
      }
      const budgetRef = doc(db, "budgets", window.currentUser.uid);
      await setDoc(budgetRef, { lastResetYear: nowYear, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.error("Yearly reset failed:", e);
    }
  }
  __yearResetRan = true;
}

// ---- Legacy claim helpers: attach userId once for old docs ----
async function claimLegacyTransactionIfNeeded(id) {
  const ref = doc(db, "transactions", id);
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
    unsubscribeBudget = onSnapshot(budgetRef, async (snap) => {
        if (snap.exists()) {
            window.currentBudget = snap.data();

            // hydrate yearly toggles
            const txT = document.getElementById("yearResetTxToggle");
            const svT = document.getElementById("yearResetSavingsToggle");
            if (txT) txT.checked = !!window.currentBudget.yearResetTx;
            if (svT) svT.checked = !!window.currentBudget.yearResetSavings;

            updateBudgetDisplay();
        } else {
            window.currentBudget = null;
            updateBudgetDisplay();
        }
        await tryProcessYearlyReset(); // run after budget present
    }, (error) => {
        console.error("Error loading budget:", error);
    });
}

function loadSavings() {
    if (!window.currentUser) return;
    const savingsRef = doc(db, "savings", window.currentUser.uid);
    if (unsubscribeSavings) unsubscribeSavings();
    unsubscribeSavings = onSnapshot(savingsRef, async (snap) => {
        if (snap.exists()) {
            window.currentSavings = snap.data();
            updateSavingsDisplay();
            const toggle = document.getElementById("autoSavingsToggle");
            if (toggle) toggle.checked = !!window.currentSavings.autoAddBalance;
        } else {
            window.currentSavings = { totalSavings: 0, autoAddBalance: false, savingsGoal: 0 };
            updateSavingsDisplay();
        }
        await tryProcessYearlyReset(); // run after savings present
    }, (error) => {
        console.error("Error loading savings:", error);
    });
}

function updateBudgetDisplay() {
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

  if (!window.currentBudget || isNaN(Number(window.currentBudget.monthlyLimit))) {
    document.getElementById("budgetRemaining").textContent = "Not Set";
    const bar = document.getElementById("budgetBar");
    if (bar) bar.style.width = "0%";
    updateBudgetTransactionsList();
    return;
  }

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

  updateBudgetTransactionsList();
}

// helper to format a txn row with your exact styles/classes
function renderTxnRow(t, i) {
    const categoryIcons = {
        salary: "💼", investment: "📈", business: "🏢", "other-income": "💰",
        food: "🍔", transportation: "🚗", shopping: "🛍️",
        entertainment: "🎬", bills: "📄", healthcare: "🏥",
        education: "📚", subscriptions: "📱", "other-expense": "📦"
    };
    const ms = tsToMs(t.timestamp) ?? tsToMs(t.createdAt) ?? Date.now();
    const date = new Date(ms);
    const dStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const icon = categoryIcons[t.category] || (t.type === "income" ? "💰" : "💸");
    return `
    <div class="transaction-item" style="animation-delay:${i * 0.05}s">
        <div class="transaction-info">
            <div class="transaction-icon ${t.type}">${icon}</div>
            <div class="transaction-details">
                <div class="transaction-description">${t.description}</div>
                <div class="transaction-meta"><span>${t.category.replace("-", " ")}</span><span>•</span><span>${dStr}</span></div>
            </div>
        </div>
        <div class="transaction-amount ${t.type}">${t.type === "income" ? "+" : "-"}$${Number(t.amount).toFixed(2)}</div>
        <button type="button" class="delete-btn" onclick="deleteTransaction('${t.id}', event)">×</button>
    </div>`;
}

function updateBudgetTransactionsList() {
    const list = document.getElementById("budgetTransactionsList");
    if (!list) return;

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
    const total = Number(window.currentSavings?.totalSavings || 0);
    const goal = Number(window.currentSavings?.savingsGoal || 0);
    const totalEl = document.getElementById("totalSavings");
    const goalEl = document.getElementById("savingsGoalDisplay");
    if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;
    if (goalEl) goalEl.textContent = `$${goal.toFixed(2)}`;
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
function visibleTransactionsForDashboard() {
  // WHY: If “Reset Income/Expenses at year end” is ON, only show current year in dashboard totals/lists.
  const shouldFilterYear = !!window.currentBudget?.yearResetTx;
  if (!shouldFilterYear) return window.transactions;

  const y = new Date().getFullYear();
  return window.transactions.filter(t => {
    const ms = tsToMs(t.timestamp) ?? tsToMs(t.createdAt);
    if (ms == null) return false;
    const d = new Date(ms);
    return d.getFullYear() === y;
  });
}

function updateUI() {
    updateSummary();
    updateTransactionsList();
    updateBudgetDisplay();
    if (window.currentTab === "analytics") updateCharts();
    updateRolloverNote();
}

function updateSummary() {
  const txns = visibleTransactionsForDashboard();

  let income = 0, expenses = 0;
  txns.forEach(t => {
    if (t.type === "income") income += Number(t.amount) || 0;
    else expenses += Number(t.amount) || 0;
  });
  const balance = income - expenses;

  document.getElementById("totalIncome").textContent = `$${income.toFixed(2)}`;
  document.getElementById("totalExpenses").textContent = `$${expenses.toFixed(2)}`;

  const balanceEl = document.getElementById("balance");
  if (Date.now() < window.__rolloverNoteUntil && window.__rolloverAmount > 0) {
    const amt = window.__rolloverAmount.toFixed(2);
    balanceEl.textContent = `-$${amt} (Added to Savings)`;
  } else {
    balanceEl.textContent = `${balance >= 0 ? "$" : "-$"}${Math.abs(balance).toFixed(2)}`;
  }
}

function updateTransactionsList() {
    const list = document.getElementById("transactionsList");
    let txns = visibleTransactionsForDashboard().filter(t => !t.isSystem && t.category !== "__rollover__");
    if (window.currentFilter !== "all") txns = txns.filter(t => t.type === window.currentFilter);

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
                    <div class="recurring-amount">${r.type === "income" ? "+" : "-"}$${Number(r.amount).toFixed(2)}</div>
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
    document.querySelectorAll(".filter-btn").forEach(btn => btn.classList.remove("active"));
    if (e) e.target.classList.add("active");
    updateTransactionsList();
};

// ==============================
// Chart Period Controls (Analytics)
// ==============================
window.updateChartPeriod = (period, e) => {
    window.chartPeriod = period;
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

function startOfPeriod(period, now = new Date()) {
  if (period === "week") {
    const s = new Date(now); s.setDate(now.getDate() - 6); s.setHours(0,0,0,0); return s;
  } else if (period === "month") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1); s.setHours(0,0,0,0); return s;
  } else { // "year"
    const s = new Date(now.getFullYear(), 0, 1); s.setHours(0,0,0,0); return s;
  }
}

function updateCharts() {
  if (!financeChart || !categoryChart) return;

  const now = new Date(); now.setHours(0,0,0,0);
  const start = startOfPeriod(window.chartPeriod, now);

  const daily = new Map();
  for (const t of window.transactions) {
    const ms = (t.timestamp?.toMillis?.() ?? (t.timestamp?.seconds ? t.timestamp.seconds * 1000 : null))
              ?? (typeof t.createdAt === "string" ? new Date(t.createdAt).getTime() : null);
    if (ms == null) continue;
    const d = new Date(ms); d.setHours(0,0,0,0);
    if (d < start || d > now) continue;

    const key = d.toISOString().slice(0,10);
    if (!daily.has(key)) daily.set(key, { income: 0, expenses: 0 });
    if (t.type === "income") daily.get(key).income += Number(t.amount) || 0;
    else if (t.type === "expense") daily.get(key).expenses += Number(t.amount) || 0;
  }

  const labels = [];
  const perDayIncome = [];
  const perDayExpenses = [];
  const cursor = new Date(start);
  while (cursor <= now) {
    const key = cursor.toISOString().slice(0,10);
    const row = daily.get(key) || { income: 0, expenses: 0 };
    labels.push(cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    perDayIncome.push(row.income);
    perDayExpenses.push(row.expenses);
    cursor.setDate(cursor.getDate() + 1);
  }

  const cumIncome = [];
  const cumExpenses = [];
  const cumNet = [];
  let accI = 0, accE = 0;
  for (let i = 0; i < labels.length; i++) {
    accI += perDayIncome[i];
    accE += perDayExpenses[i];
    cumIncome.push(accI);
    cumExpenses.push(accE);
    cumNet.push(accI - accE);
  }

  financeChart.data.labels = labels;
  financeChart.data.datasets[0].label = "Income";
  financeChart.data.datasets[1].label = "Expenses";
  financeChart.data.datasets[2].label = "Net Balance";
  financeChart.data.datasets[0].data = cumIncome;
  financeChart.data.datasets[1].data = cumExpenses;
  financeChart.data.datasets[2].data = cumNet;
  financeChart.update();

  const catTotals = {};
  for (const t of window.transactions) {
    const ms = (t.timestamp?.toMillis?.() ?? (t.timestamp?.seconds ? t.timestamp.seconds * 1000 : null))
              ?? (typeof t.createdAt === "string" ? new Date(t.createdAt).getTime() : null);
    if (ms == null) continue;
    const d = new Date(ms); d.setHours(0,0,0,0);
    if (d < start || d > now) continue;
    if (t.type === "expense") {
      catTotals[t.category] = (catTotals[t.category] || 0) + (Number(t.amount) || 0);
    }
  }

  categoryChart.data.labels = Object.keys(catTotals).map(k => k.replace(/-/g, " "));
  categoryChart.data.datasets[0].data = Object.values(catTotals);
  categoryChart.update();
}

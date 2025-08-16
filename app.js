        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
        import { 
            getAuth, 
            createUserWithEmailAndPassword, 
            signInWithEmailAndPassword, 
            signOut, 
            onAuthStateChanged 
        } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
        import { 
            getFirestore, 
            collection, 
            addDoc, 
            query, 
            where,
            orderBy, 
            onSnapshot, 
            deleteDoc, 
            doc,
            Timestamp 
        } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

        // Firebase configuration
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

        // Global variables
        window.currentUser = null;
        window.transactions = [];
        window.recurringTransactions = [];
        window.currentFilter = 'all';
        window.currentTab = 'dashboard';
        window.chartPeriod = 'week';
        window.selectedType = 'expense';
        window.selectedRecurringType = 'expense';
        window.selectedFrequency = 'weekly';
        let unsubscribeTransactions = null;
        let unsubscribeRecurring = null;
        let financeChart = null;
        let categoryChart = null;

        // Type Selection Functions
        window.selectType = function(type) {
            window.selectedType = type;
            document.getElementById('transactionType').value = type;
            
            // Update button states
            document.getElementById('incomeBtn').classList.toggle('active', type === 'income');
            document.getElementById('expenseBtn').classList.toggle('active', type === 'expense');
        }

        window.selectRecurringType = function(type) {
            window.selectedRecurringType = type;
            document.getElementById('recurringType').value = type;
            
            // Update button states
            document.getElementById('recurringIncomeBtn').classList.toggle('active', type === 'income');
            document.getElementById('recurringExpenseBtn').classList.toggle('active', type === 'expense');
        }

        window.selectFrequency = function(frequency, event) {
            window.selectedFrequency = frequency;
            document.getElementById('recurringFrequency').value = frequency;

            // Reset buttons
            document.querySelectorAll('.frequency-btn').forEach(btn => btn.classList.remove('active'));

            // Add active to the clicked one
            if (event) event.target.classList.add('active');
        }

        // UI Helper Functions
        function showLoading(show = true) {
            const overlay = document.getElementById('loadingOverlay');
            if (show) {
                overlay.classList.add('active');
            } else {
                overlay.classList.remove('active');
            }
        }

        function showError(elementId, message) {
            const errorElement = document.getElementById(elementId);
            errorElement.textContent = message;
            errorElement.classList.remove('hidden');
            setTimeout(() => {
                errorElement.classList.add('hidden');
            }, 5000);
        }

        function showSuccess(elementId, message) {
            const successElement = document.getElementById(elementId);
            successElement.textContent = message;
            successElement.classList.remove('hidden');
            setTimeout(() => {
                successElement.classList.add('hidden');
            }, 3000);
        }

        // Password Toggle
        window.togglePassword = function(inputId) {
            const input = document.getElementById(inputId);
            input.type = input.type === 'password' ? 'text' : 'password';
        }

        // Tab Switching
        window.switchTab = function(tab, event) {
            window.currentTab = tab;

            // Update tab buttons
            document.querySelectorAll('.nav-tab').forEach(btn => btn.classList.remove('active'));
            if (event) event.target.classList.add('active');

            // Update tab content
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(tab + 'Tab').classList.add('active');

            // Init charts if analytics tab
            if (tab === 'analytics') {
                setTimeout(() => initCharts(), 100);
            }
        }

        // Auth Functions
        window.handleLogin = async function(event) {
            event.preventDefault();
            
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;
            
            try {
                showLoading(true);
                await signInWithEmailAndPassword(auth, email, password);
                showSuccess('loginSuccess', 'Welcome back!');
                document.getElementById('loginEmail').value = '';
                document.getElementById('loginPassword').value = '';
            } catch (error) {
                console.error('Login error:', error);
                showError('loginError', 'Invalid email or password');
            } finally {
                showLoading(false);
            }
        }

        window.handleSignup = async function(event) {
            event.preventDefault();
            
            const email = document.getElementById('signupEmail').value.trim();
            const password = document.getElementById('signupPassword').value;
            const confirmPassword = document.getElementById('signupPasswordConfirm').value;
            
            if (password !== confirmPassword) {
                showError('signupError', 'Passwords do not match');
                return;
            }
            
            try {
                showLoading(true);
                await createUserWithEmailAndPassword(auth, email, password);
                showSuccess('signupSuccess', 'Account created!');
                document.getElementById('signupEmail').value = '';
                document.getElementById('signupPassword').value = '';
                document.getElementById('signupPasswordConfirm').value = '';
            } catch (error) {
                console.error('Signup error:', error);
                showError('signupError', error.message);
            } finally {
                showLoading(false);
            }
        }

        window.logout = async function() {
            if (confirm('Are you sure you want to logout?')) {
                try {
                    showLoading(true);
                    await signOut(auth);
                } catch (error) {
                    console.error('Logout error:', error);
                } finally {
                    showLoading(false);
                }
            }
        }

        // UI Navigation
        window.showLogin = function() {
            document.getElementById('loginForm').classList.remove('hidden');
            document.getElementById('signupForm').classList.add('hidden');
        }

        window.showSignup = function() {
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('signupForm').classList.remove('hidden');
        }

        function showAuth() {
            document.getElementById('authContainer').style.display = 'block';
            document.getElementById('appContainer').style.display = 'none';
            document.querySelector('.app-container').style.display = 'none';
        }

        function showApp() {
            document.getElementById('authContainer').style.display = 'none';
            document.getElementById('appContainer').style.display = 'block';
            document.querySelector('.app-container').style.display = 'block';
            document.getElementById('userEmail').textContent = window.currentUser.email;
        }

        // Transaction Functions
        window.handleAddTransaction = async function(event) {
            event.preventDefault();
            
            const type = document.getElementById('transactionType').value;
            const description = document.getElementById('transactionDescription').value.trim();
            const amount = parseFloat(document.getElementById('transactionAmount').value);
            const category = document.getElementById('transactionCategory').value;
            
            try {
                showLoading(true);
                await addDoc(collection(db, 'transactions'), {
                    userId: window.currentUser.uid,
                    type: type,
                    description: description,
                    amount: amount,
                    category: category,
                    timestamp: Timestamp.now(),
                    createdAt: new Date().toISOString()
                });
                
                // Clear form
                document.getElementById('transactionDescription').value = '';
                document.getElementById('transactionAmount').value = '';
                document.getElementById('transactionCategory').value = '';
                
            } catch (error) {
                console.error('Error adding transaction:', error);
                alert('Error adding transaction');
            } finally {
                showLoading(false);
            }
        }

        window.deleteTransaction = async function(transactionId) {
            if (confirm('Delete this transaction?')) {
                try {
                    showLoading(true);
                    await deleteDoc(doc(db, 'transactions', transactionId));
                } catch (error) {
                    console.error('Error deleting transaction:', error);
                } finally {
                    showLoading(false);
                }
            }
        }

        // Filter Transactions
        window.filterTransactions = function(filter, event) {
            window.currentFilter = filter;

            // Update filter buttons
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            if (event) event.target.classList.add('active');

            updateTransactionsList();
        }

        // Recurring Transactions
        window.openRecurringModal = function() {
            document.getElementById('recurringModal').classList.add('active');
        }

        window.closeRecurringModal = function() {
            document.getElementById('recurringModal').classList.remove('active');
        }

        window.handleAddRecurring = async function(event) {
            event.preventDefault();

            const frequency = document.getElementById('recurringFrequency').value;
            const type = document.getElementById('recurringType').value;
            const description = document.getElementById('recurringDescription').value;
            const amount = parseFloat(document.getElementById('recurringAmount').value);
            const category = document.getElementById('recurringCategory').value;

            console.log("Adding recurring:", { 
                user: window.currentUser, frequency, type, description, amount, category 
            });

            try {
                showLoading(true);
                await addDoc(collection(db, 'recurring'), {
                    userId: window.currentUser?.uid,
                    frequency, type, description, amount, category,
                    active: true,
                    createdAt: new Date().toISOString()
                });

                console.log("✅ Recurring transaction saved");
                closeRecurringModal();
                event.target.reset();
                window.selectRecurringType('expense');
                window.selectFrequency('weekly', event);
            } catch (error) {
                console.error("❌ Error adding recurring:", error);
                alert("Error adding recurring: " + error.message);
            } finally {
                showLoading(false);
            }
        }


        window.deleteRecurring = async function(recurringId) {
            if (confirm('Delete this recurring transaction?')) {
                try {
                    showLoading(true);
                    await deleteDoc(doc(db, 'recurring', recurringId));
                } catch (error) {
                    console.error('Error deleting recurring:', error);
                } finally {
                    showLoading(false);
                }
            }
        }

        // Load Transactions
        function loadTransactions() {
            if (!window.currentUser) return;
            
            if (unsubscribeTransactions) {
                unsubscribeTransactions();
            }
            
            try {
                const q = query(
                    collection(db, 'transactions'),
                    where('userId', '==', window.currentUser.uid),
                    orderBy('timestamp', 'desc')
                );
                
                unsubscribeTransactions = onSnapshot(q, (querySnapshot) => {
                    window.transactions = [];
                    querySnapshot.forEach((doc) => {
                        window.transactions.push({
                            id: doc.id,
                            ...doc.data()
                        });
                    });
                    updateUI();
                }, (error) => {
                    console.error('Error loading transactions:', error);
                    window.transactions = [];
                    updateUI();
                });
            } catch (error) {
                console.error('Error setting up listener:', error);
            }
        }

        // Load Recurring
        function loadRecurring() {
            if (!window.currentUser) return;
            
            if (unsubscribeRecurring) {
                unsubscribeRecurring();
            }
            
            try {
                const q = query(
                    collection(db, 'recurring'),
                    where('userId', '==', window.currentUser.uid)
                );
                
                unsubscribeRecurring = onSnapshot(q, (querySnapshot) => {
                    window.recurringTransactions = [];
                    querySnapshot.forEach((doc) => {
                        window.recurringTransactions.push({
                            id: doc.id,
                            ...doc.data()
                        });
                    });
                    updateRecurringList();
                });
            } catch (error) {
                console.error('Error loading recurring:', error);
            }
        }

        // Update UI
        function updateUI() {
            updateSummary();
            updateTransactionsList();
            if (window.currentTab === 'analytics') {
                updateCharts();
            }
        }

        function updateSummary() {
            let totalIncome = 0;
            let totalExpenses = 0;
            
            window.transactions.forEach(transaction => {
                if (transaction.type === 'income') {
                    totalIncome += transaction.amount;
                } else {
                    totalExpenses += transaction.amount;
                }
            });
            
            const balance = totalIncome - totalExpenses;
            
            document.getElementById('totalIncome').textContent = `$${totalIncome.toFixed(2)}`;
            document.getElementById('totalExpenses').textContent = `$${totalExpenses.toFixed(2)}`;
            document.getElementById('balance').textContent = `${balance >= 0 ? '$' : '-$'}${Math.abs(balance).toFixed(2)}`;
        }

        function updateTransactionsList() {
            const transactionsList = document.getElementById('transactionsList');
            
            let filteredTransactions = window.transactions;
            if (window.currentFilter !== 'all') {
                filteredTransactions = window.transactions.filter(t => t.type === window.currentFilter);
            }
            
            if (filteredTransactions.length === 0) {
                transactionsList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📝</div>
                        <h4>No transactions yet</h4>
                        <p>Add your first transaction to get started</p>
                    </div>
                `;
                return;
            }
            
            const categoryIcons = {
                'salary': '💼',
                'investment': '📈',
                'other-income': '💰',
                'food': '🍔',
                'transportation': '🚗',
                'shopping': '🛍️',
                'entertainment': '🎬',
                'bills': '📄',
                'healthcare': '🏥',
                'education': '📚',
                'other-expense': '📦'
            };
            
            transactionsList.innerHTML = filteredTransactions.map((transaction, index) => {
                const date = transaction.timestamp ? new Date(transaction.timestamp.seconds * 1000) : new Date();
                const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const icon = categoryIcons[transaction.category] || '💰';
                
                return `
                    <div class="transaction-item" style="animation-delay: ${index * 0.05}s">
                        <div class="transaction-info">
                            <div class="transaction-icon ${transaction.type}">
                                ${icon}
                            </div>
                            <div class="transaction-details">
                                <div class="transaction-description">${transaction.description}</div>
                                <div class="transaction-meta">
                                    <span>${transaction.category.replace('-', ' ')}</span>
                                    <span>•</span>
                                    <span>${formattedDate}</span>
                                </div>
                            </div>
                        </div>
                        <div class="transaction-amount ${transaction.type}">
                            ${transaction.type === 'income' ? '+' : '-'}$${transaction.amount.toFixed(2)}
                        </div>
                        <button class="delete-btn" onclick="deleteTransaction('${transaction.id}')">
                            ×
                        </button>
                    </div>
                `;
            }).join('');
        }

        function updateRecurringList() {
            const recurringList = document.getElementById('recurringList');
            
            if (window.recurringTransactions.length === 0) {
                recurringList.innerHTML = '<div class="empty-state"><p>No recurring transactions yet</p></div>';
                return;
            }
            
            // Group by frequency
            const grouped = {
                weekly: [],
                biweekly: [],
                monthly: [],
                yearly: []
            };
            
            window.recurringTransactions.forEach(r => {
                if (grouped[r.frequency]) {
                    grouped[r.frequency].push(r);
                }
            });
            
            recurringList.innerHTML = window.recurringTransactions.map(r => `
                <div class="recurring-item">
                    <div class="recurring-info">
                        <div class="recurring-details">
                            <div class="recurring-description">${r.description}</div>
                            <div class="recurring-amount">${r.type === 'income' ? '+' : '-'}$${r.amount.toFixed(2)}</div>
                        </div>
                        <span class="recurring-frequency">${r.frequency}</span>
                    </div>
                    <button class="delete-btn" onclick="deleteRecurring('${r.id}')">×</button>
                </div>
            `).join('');
        }

        // Charts
        function initCharts() {
            const ctx1 = document.getElementById('financeChart');
            const ctx2 = document.getElementById('categoryChart');
            
            if (!ctx1 || !ctx2) return;
            
            // Destroy existing charts
            if (financeChart) financeChart.destroy();
            if (categoryChart) categoryChart.destroy();
            
            // Finance Chart
            financeChart = new Chart(ctx1, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Income',
                        data: [],
                        borderColor: '#10B981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4
                    }, {
                        label: 'Expenses',
                        data: [],
                        borderColor: '#EF4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.4
                    }, {
                        label: 'Net Balance',
                        data: [],
                        borderColor: '#FFD700',
                        backgroundColor: 'rgba(255, 215, 0, 0.1)',
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: {
                                color: '#F0F0F0'
                            }
                        }
                    },
                    scales: {
                        y: {
                            ticks: {
                                color: '#F0F0F0'
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        },
                        x: {
                            ticks: {
                                color: '#F0F0F0'
                            },
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        }
                    }
                }
            });
            
            // Category Chart
            categoryChart = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: [
                            '#FFD700',
                            '#9333EA',
                            '#10B981',
                            '#EF4444',
                            '#3B82F6',
                            '#F59E0B',
                            '#EC4899',
                            '#8B5CF6'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: {
                                color: '#F0F0F0'
                            }
                        }
                    }
                }
            });
            
            updateCharts();
        }

        function updateCharts() {
            if (!financeChart || !categoryChart) return;
            
            // Group transactions by date
            const grouped = {};
            window.transactions.forEach(t => {
                const date = new Date(t.timestamp.seconds * 1000).toLocaleDateString();
                if (!grouped[date]) {
                    grouped[date] = { income: 0, expenses: 0 };
                }
                if (t.type === 'income') {
                    grouped[date].income += t.amount;
                } else {
                    grouped[date].expenses += t.amount;
                }
            });
            
            const dates = Object.keys(grouped).sort().slice(-7);
            const incomeData = dates.map(d => grouped[d].income);
            const expenseData = dates.map(d => grouped[d].expenses);
            const balanceData = dates.map(d => grouped[d].income - grouped[d].expenses);
            
            financeChart.data.labels = dates;
            financeChart.data.datasets[0].data = incomeData;
            financeChart.data.datasets[1].data = expenseData;
            financeChart.data.datasets[2].data = balanceData;
            financeChart.update();
            
            // Category breakdown
            const categories = {};
            window.transactions.forEach(t => {
                if (t.type === 'expense') {
                    categories[t.category] = (categories[t.category] || 0) + t.amount;
                }
            });
            
            categoryChart.data.labels = Object.keys(categories);
            categoryChart.data.datasets[0].data = Object.values(categories);
            categoryChart.update();
        }

        window.updateChartPeriod = function(period, event) {
            window.chartPeriod = period;

            // Update chart control buttons
            document.querySelectorAll('.chart-control-btn').forEach(btn => btn.classList.remove('active'));
            if (event) event.target.classList.add('active');

            updateCharts();
        }

        // Auth State Observer
        onAuthStateChanged(auth, (user) => {
            if (user) {
                window.currentUser = user;
                showApp();
                loadTransactions();
                loadRecurring();
            } else {
                window.currentUser = null;
                if (unsubscribeTransactions) unsubscribeTransactions();
                if (unsubscribeRecurring) unsubscribeRecurring();
                showAuth();
            }
        });

        // Initialize
        showLoading(false);

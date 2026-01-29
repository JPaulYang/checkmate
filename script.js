// Global variables
let currentUser = null;
let currentMonth = new Date();

// Icon mapping
const activityIcons = {
    paper: '📚',
    fitness: '💪',
    algorithm: '💻',
    quant: '📊'
};

const activityNames = {
    paper: 'Read Paper',
    fitness: 'Fitness',
    algorithm: 'Algorithm',
    quant: 'Quant Interview'
};

// Password hashing function using SHA-256
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    checkLogin();
});

// Check login status
function checkLogin() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = savedUser;
        showMainSection();
    }
}

// Login
async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
        alert('Please enter username and password');
        return;
    }

    // Hash the password
    const hashedPassword = await hashPassword(password);

    // Get user data from localStorage
    const users = JSON.parse(localStorage.getItem('users') || '{}');

    if (users[username]) {
        // Existing user, verify password
        if (users[username].password === hashedPassword) {
            currentUser = username;
            localStorage.setItem('currentUser', username);
            showMainSection();
        } else {
            alert('Incorrect password');
        }
    } else {
        // New user, auto-register
        users[username] = {
            password: hashedPassword,
            checkins: {}
        };
        localStorage.setItem('users', JSON.stringify(users));
        currentUser = username;
        localStorage.setItem('currentUser', username);
        alert('Registration successful!');
        showMainSection();
    }
}

// Logout
function logout() {
    localStorage.removeItem('currentUser');
    currentUser = null;
    document.getElementById('loginSection').style.display = 'flex';
    document.getElementById('mainSection').style.display = 'none';
}

// Show main section
function showMainSection() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('mainSection').style.display = 'block';
    document.getElementById('currentUser').textContent = `Welcome, ${currentUser}!`;

    updateTodaySection();
    renderCalendar();
}

// Update today's check-in section
function updateTodaySection() {
    const today = getTodayString();
    document.getElementById('todayDate').textContent = formatDate(new Date());

    const todayCheckins = getTodayCheckin();
    const statusDiv = document.getElementById('todayStatus');

    // Update status display
    if (todayCheckins && todayCheckins.length > 0) {
        const iconsList = todayCheckins.map(activity => `${activityIcons[activity]} ${activityNames[activity]}`).join(', ');
        statusDiv.textContent = `✅ Checked in today: ${iconsList}`;
        statusDiv.style.background = '#667eea';
        statusDiv.style.color = 'white';
    } else {
        statusDiv.textContent = '⏰ Not checked in today - Click buttons to check in (you can select multiple)';
        statusDiv.style.background = '#ff9800';
        statusDiv.style.color = 'white';
    }

    // Update button states
    const buttons = document.querySelectorAll('.checkin-options button');
    buttons.forEach(button => {
        const activity = button.getAttribute('data-activity');
        if (todayCheckins && todayCheckins.includes(activity)) {
            button.classList.add('selected');
        } else {
            button.classList.remove('selected');
        }
    });

    updateTodayActivity();
}

// Toggle check-in (support multiple selections)
function toggleCheckin(activity) {
    const today = getTodayString();
    const users = JSON.parse(localStorage.getItem('users') || '{}');

    if (!users[currentUser]) {
        alert('User data error, please login again');
        logout();
        return;
    }

    // Get current check-ins (array) or initialize as empty array
    let currentCheckins = users[currentUser].checkins[today];

    // Migrate old data format (string) to new format (array)
    if (typeof currentCheckins === 'string') {
        currentCheckins = [currentCheckins];
    } else if (!currentCheckins) {
        currentCheckins = [];
    }

    // Toggle the activity
    const index = currentCheckins.indexOf(activity);
    if (index > -1) {
        // Already checked in - remove it
        currentCheckins.splice(index, 1);
    } else {
        // Not checked in - add it
        currentCheckins.push(activity);
    }

    // Update or delete the check-in
    if (currentCheckins.length === 0) {
        delete users[currentUser].checkins[today];
    } else {
        users[currentUser].checkins[today] = currentCheckins;
    }

    localStorage.setItem('users', JSON.stringify(users));
    updateTodaySection();
    renderCalendar();
}

// Update today's activity list
function updateTodayActivity() {
    const today = getTodayString();
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    const activityList = document.getElementById('todayActivityList');

    const todayCheckins = [];

    // Collect all users who checked in today
    Object.entries(users).forEach(([username, userData]) => {
        if (userData.checkins[today]) {
            let activities = userData.checkins[today];

            // Migrate old format (string) to new format (array)
            if (typeof activities === 'string') {
                activities = [activities];
            }

            if (Array.isArray(activities) && activities.length > 0) {
                todayCheckins.push({
                    username: username,
                    activities: activities
                });
            }
        }
    });

    // Sort alphabetically by username
    todayCheckins.sort((a, b) => a.username.localeCompare(b.username));

    if (todayCheckins.length === 0) {
        activityList.innerHTML = '<div class="no-activity">No one has checked in today yet. Be the first!</div>';
    } else {
        let html = '';
        todayCheckins.forEach(item => {
            const isCurrentUser = item.username === currentUser;
            const activitiesText = item.activities.map(activity =>
                `<span class="activity-icon">${activityIcons[activity]}</span> ${activityNames[activity]}`
            ).join(', ');

            html += `
                <div class="activity-item ${isCurrentUser ? 'current-user' : ''}">
                    <div class="activity-user">
                        <span class="activity-username">${item.username}</span>
                        ${isCurrentUser ? '<span class="activity-badge">You</span>' : ''}
                    </div>
                    <div class="activity-type">
                        ${activitiesText}
                    </div>
                </div>
            `;
        });
        activityList.innerHTML = html;
    }
}

// Get today's check-in (returns array)
function getTodayCheckin() {
    const today = getTodayString();
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    let checkins = users[currentUser]?.checkins[today];

    // Migrate old format (string) to new format (array)
    if (typeof checkins === 'string') {
        return [checkins];
    }

    return checkins || [];
}

// Get today's date string (YYYY-MM-DD)
function getTodayString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Format date display
function formatDate(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// Render calendar
function renderCalendar() {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('currentMonth').textContent = `${months[month]} ${year}`;

    const calendar = document.getElementById('calendar');
    calendar.innerHTML = '';

    // Add weekday headers
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    weekDays.forEach(day => {
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day header';
        dayHeader.textContent = day;
        calendar.appendChild(dayHeader);
    });

    // Get first and last day of month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstDayWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    // Get user check-in data
    const users = JSON.parse(localStorage.getItem('users') || '{}');
    const checkins = users[currentUser]?.checkins || {};

    // Previous month trailing dates
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = firstDayWeek - 1; i >= 0; i--) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.innerHTML = `<div class="date">${prevMonthLastDay - i}</div>`;
        calendar.appendChild(dayDiv);
    }

    // Current month dates
    const today = new Date();
    const todayString = getTodayString();

    for (let day = 1; day <= daysInMonth; day++) {
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';

        // Mark today
        if (dateString === todayString) {
            dayDiv.classList.add('today');
        }

        // Show date
        let html = `<div class="date">${day}</div>`;

        // Show check-in icons (support multiple)
        if (checkins[dateString]) {
            let activities = checkins[dateString];

            // Migrate old format (string) to new format (array)
            if (typeof activities === 'string') {
                activities = [activities];
            }

            if (Array.isArray(activities) && activities.length > 0) {
                const iconCount = activities.length;
                const iconClass = iconCount === 1 ? 'icon-single' :
                                 iconCount === 2 ? 'icon-double' :
                                 'icon-multiple';

                html += `<div class="icon-container ${iconClass}">`;
                activities.forEach(activity => {
                    html += `<span class="icon">${activityIcons[activity]}</span>`;
                });
                html += `</div>`;
            }
        }

        dayDiv.innerHTML = html;
        calendar.appendChild(dayDiv);
    }

    // Next month leading dates
    const remainingDays = 42 - (firstDayWeek + daysInMonth); // 6 rows x 7 columns = 42
    for (let day = 1; day <= remainingDays; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day other-month';
        dayDiv.innerHTML = `<div class="date">${day}</div>`;
        calendar.appendChild(dayDiv);
    }
}

// Change month
function changeMonth(delta) {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
    renderCalendar();
}

// ==================== Admin Panel Functions ====================

// IMPORTANT: Set your admin password here (change this before deploying!)
// Current password: "admin123"
// To change: Replace the hash below with the output of: await hashPassword("your-new-password")
const ADMIN_PASSWORD_HASH = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';

// Show admin panel (with authentication)
function showAdminPanel() {
    document.getElementById('adminLoginMessage').textContent = 'Enter admin password';
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminLogin').style.display = 'flex';
}

// Verify admin password
async function verifyAdminPassword() {
    const password = document.getElementById('adminPassword').value;

    if (!password) {
        alert('Please enter a password');
        return;
    }

    const hashedPassword = await hashPassword(password);

    if (hashedPassword === ADMIN_PASSWORD_HASH) {
        closeAdminLogin();
        openAdminPanel();
    } else {
        alert('Incorrect password. Please try again.');
    }
}

// Close admin login
function closeAdminLogin() {
    document.getElementById('adminLogin').style.display = 'none';
    document.getElementById('adminPassword').value = '';
}

// Open admin panel (after authentication)
function openAdminPanel() {
    document.getElementById('adminPanel').style.display = 'flex';
    loadAdminData();
}

// Close admin panel
function closeAdminPanel() {
    document.getElementById('adminPanel').style.display = 'none';
}

// Load admin data
function loadAdminData() {
    const users = JSON.parse(localStorage.getItem('users') || '{}');

    // Calculate statistics
    const totalUsers = Object.keys(users).length;
    let totalCheckins = 0;
    let activeToday = 0;
    const today = getTodayString();

    Object.values(users).forEach(user => {
        totalCheckins += Object.keys(user.checkins).length;
        if (user.checkins[today]) {
            activeToday++;
        }
    });

    // Display statistics
    const statsHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="number">${totalUsers}</div>
                <div class="label">Total Users</div>
            </div>
            <div class="stat-card">
                <div class="number">${totalCheckins}</div>
                <div class="label">Total Check-ins</div>
            </div>
            <div class="stat-card">
                <div class="number">${activeToday}</div>
                <div class="label">Active Today</div>
            </div>
        </div>
    `;
    document.getElementById('userStats').innerHTML = statsHTML;

    // Display user list
    let userListHTML = '';
    Object.entries(users).forEach(([username, userData]) => {
        const checkinCount = Object.keys(userData.checkins).length;
        const lastCheckin = Object.keys(userData.checkins).sort().pop() || 'Never';

        userListHTML += `
            <div class="user-item">
                <div class="user-item-header">
                    <h3>${username}</h3>
                    <div class="user-item-buttons">
                        <button class="view-btn" onclick="toggleUserDetail('${username}')">View Details</button>
                        <button class="delete-btn" onclick="deleteUser('${username}')">Delete</button>
                    </div>
                </div>
                <div class="user-item-stats">
                    <span>📊 ${checkinCount} check-ins</span>
                    <span>📅 Last: ${formatDateShort(lastCheckin)}</span>
                </div>
                <div id="detail-${username}" class="user-detail" style="display: none;"></div>
            </div>
        `;
    });

    if (userListHTML === '') {
        userListHTML = '<p>No users registered yet.</p>';
    }

    document.getElementById('userList').innerHTML = userListHTML;
}

// Toggle user detail view
function toggleUserDetail(username) {
    const detailDiv = document.getElementById(`detail-${username}`);

    if (detailDiv.style.display === 'none') {
        // Show details
        const users = JSON.parse(localStorage.getItem('users') || '{}');
        const userData = users[username];

        let historyHTML = '<h4>Check-in History:</h4><div class="checkin-history">';

        const sortedDates = Object.keys(userData.checkins).sort().reverse();
        if (sortedDates.length === 0) {
            historyHTML += '<p>No check-ins yet.</p>';
        } else {
            sortedDates.forEach(date => {
                let activities = userData.checkins[date];

                // Migrate old format (string) to new format (array)
                if (typeof activities === 'string') {
                    activities = [activities];
                }

                const activitiesText = Array.isArray(activities) ?
                    activities.map(activity => `${activityIcons[activity]} ${activityNames[activity]}`).join(', ') :
                    '';

                historyHTML += `
                    <div class="checkin-item">
                        <span>${formatDateShort(date)}</span>
                        <span>${activitiesText}</span>
                    </div>
                `;
            });
        }

        historyHTML += '</div>';
        detailDiv.innerHTML = historyHTML;
        detailDiv.style.display = 'block';
    } else {
        // Hide details
        detailDiv.style.display = 'none';
    }
}

// Delete user
function deleteUser(username) {
    if (confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
        const users = JSON.parse(localStorage.getItem('users') || '{}');
        delete users[username];
        localStorage.setItem('users', JSON.stringify(users));

        // If deleted user is currently logged in, log them out
        if (currentUser === username) {
            logout();
        }

        loadAdminData();
        alert(`User "${username}" has been deleted.`);
    }
}

// Export data
function exportData() {
    const users = localStorage.getItem('users') || '{}';
    const dataStr = JSON.stringify(JSON.parse(users), null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `checkin-data-${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    alert('Data exported successfully!');
}

// Import data
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);

            if (confirm('This will replace all existing data. Continue?')) {
                localStorage.setItem('users', JSON.stringify(importedData));
                loadAdminData();
                alert('Data imported successfully!');
            }
        } catch (error) {
            alert('Error importing data. Please check the file format.');
        }
    };
    reader.readAsText(file);

    // Reset file input
    event.target.value = '';
}

// Clear all data
function clearAllData() {
    if (confirm('⚠️ WARNING: This will delete ALL user data permanently. Are you absolutely sure?')) {
        if (confirm('This action cannot be undone. Click OK to confirm deletion.')) {
            localStorage.clear();
            loadAdminData();
            alert('All data has been cleared.');

            // Log out if someone is logged in
            if (currentUser) {
                logout();
            }
        }
    }
}

// Format date for display (short version)
function formatDateShort(dateString) {
    if (dateString === 'Never') return 'Never';
    const date = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// Generate password hash (helper function for setting new admin password)
// Usage in Console: await generatePasswordHash("your-password")
async function generatePasswordHash(password) {
    const hash = await hashPassword(password);
    console.log('Password hash for "' + password + '":');
    console.log(hash);
    console.log('\nReplace ADMIN_PASSWORD_HASH in script.js with this hash.');
    return hash;
}

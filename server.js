const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // 提供静态文件服务

// 初始化数据库
const dbPath = path.join(__dirname, 'checkmate.db');
const db = new Database(dbPath);

// 创建表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    date TEXT NOT NULL,
    activity TEXT NOT NULL,
    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_checkins_username ON checkins(username);
  CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins(date);
`);

// API: 登录/注册
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (user) {
      // 用户存在，验证密码
      if (user.password === password) {
        res.json({ success: true, message: 'Login successful' });
      } else {
        res.status(401).json({ error: 'Invalid password' });
      }
    } else {
      // 用户不存在，创建新用户
      db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, password);
      res.json({ success: true, message: 'User created and logged in' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 获取用户数据（包括签到记录）
app.get('/api/users', (req, res) => {
  try {
    const users = db.prepare('SELECT username, password FROM users').all();
    const checkins = db.prepare('SELECT username, date, activity FROM checkins').all();

    // 组织数据格式，匹配前端期望的格式
    const usersData = {};
    users.forEach(user => {
      usersData[user.username] = {
        password: user.password,
        checkins: {}
      };
    });

    // 填充签到数据
    checkins.forEach(checkin => {
      if (usersData[checkin.username]) {
        if (!usersData[checkin.username].checkins[checkin.date]) {
          usersData[checkin.username].checkins[checkin.date] = [];
        }
        usersData[checkin.username].checkins[checkin.date].push(checkin.activity);
      }
    });

    res.json(usersData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 添加签到
app.post('/api/checkin', (req, res) => {
  const { username, date, activity } = req.body;

  if (!username || !date || !activity) {
    return res.status(400).json({ error: 'Username, date, and activity required' });
  }

  try {
    // 检查是否已经签到过这个活动
    const existing = db.prepare(
      'SELECT * FROM checkins WHERE username = ? AND date = ? AND activity = ?'
    ).get(username, date, activity);

    if (existing) {
      return res.status(400).json({ error: 'Already checked in for this activity today' });
    }

    db.prepare('INSERT INTO checkins (username, date, activity) VALUES (?, ?, ?)').run(username, date, activity);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 删除签到
app.delete('/api/checkin', (req, res) => {
  const { username, date, activity } = req.body;

  if (!username || !date || !activity) {
    return res.status(400).json({ error: 'Username, date, and activity required' });
  }

  try {
    db.prepare('DELETE FROM checkins WHERE username = ? AND date = ? AND activity = ?').run(username, date, activity);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 删除用户
app.delete('/api/user/:username', (req, res) => {
  const { username } = req.params;

  try {
    db.prepare('DELETE FROM checkins WHERE username = ?').run(username);
    db.prepare('DELETE FROM users WHERE username = ?').run(username);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 导入数据
app.post('/api/import', (req, res) => {
  const usersData = req.body;

  try {
    db.exec('BEGIN TRANSACTION');

    // 清空现有数据
    db.prepare('DELETE FROM checkins').run();
    db.prepare('DELETE FROM users').run();

    // 导入新数据
    for (const [username, userData] of Object.entries(usersData)) {
      db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, userData.password);

      if (userData.checkins) {
        for (const [date, activities] of Object.entries(userData.checkins)) {
          const activityArray = Array.isArray(activities) ? activities : [activities];
          activityArray.forEach(activity => {
            db.prepare('INSERT INTO checkins (username, date, activity) VALUES (?, ?, ?)').run(username, date, activity);
          });
        }
      }
    }

    db.exec('COMMIT');
    res.json({ success: true });
  } catch (error) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: error.message });
  }
});

// API: 导出数据
app.get('/api/export', (req, res) => {
  try {
    const users = db.prepare('SELECT username, password FROM users').all();
    const checkins = db.prepare('SELECT username, date, activity FROM checkins').all();

    const usersData = {};
    users.forEach(user => {
      usersData[user.username] = {
        password: user.password,
        checkins: {}
      };
    });

    checkins.forEach(checkin => {
      if (usersData[checkin.username]) {
        if (!usersData[checkin.username].checkins[checkin.date]) {
          usersData[checkin.username].checkins[checkin.date] = [];
        }
        usersData[checkin.username].checkins[checkin.date].push(checkin.activity);
      }
    });

    res.json(usersData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Checkmate server running on http://localhost:${PORT}`);
});

// 优雅关闭
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

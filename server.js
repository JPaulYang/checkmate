const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // 提供静态文件服务

// 数据库配置
const DATABASE_URL = process.env.DATABASE_URL;
const usePostgres = !!DATABASE_URL;

let db;

// 初始化数据库
async function initDatabase() {
  if (usePostgres) {
    // 使用 PostgreSQL
    console.log('Using PostgreSQL database');
    const { Pool } = require('pg');

    db = new Pool({
      connectionString: DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });

    // 创建表（PostgreSQL 语法）
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS checkins (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        date TEXT NOT NULL,
        activity TEXT NOT NULL,
        FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_checkins_username ON checkins(username);
      CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins(date);
    `);
  } else {
    // 使用 SQLite
    console.log('Using SQLite database');
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, 'checkmate.db');
    db = new Database(dbPath);

    // 创建表（SQLite 语法）
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
  }
}

// 数据库查询抽象层
async function query(sql, params = []) {
  if (usePostgres) {
    const result = await db.query(sql, params);
    return result.rows;
  } else {
    if (sql.includes('RETURNING')) {
      // SQLite 不支持 RETURNING，需要特殊处理
      const insertSql = sql.replace(/RETURNING.*$/, '').trim();
      const stmt = db.prepare(insertSql);
      const result = stmt.run(...params);
      return [{ id: result.lastInsertRowid }];
    }
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  }
}

async function queryOne(sql, params = []) {
  if (usePostgres) {
    const result = await db.query(sql, params);
    return result.rows[0];
  } else {
    const stmt = db.prepare(sql);
    return stmt.get(...params);
  }
}

async function execute(sql, params = []) {
  if (usePostgres) {
    await db.query(sql, params);
  } else {
    const stmt = db.prepare(sql);
    stmt.run(...params);
  }
}

// 转换 SQL 参数占位符（? 转为 $1, $2...）
function convertSql(sql, params) {
  if (!usePostgres) return { sql, params };

  let index = 1;
  const convertedSql = sql.replace(/\?/g, () => `$${index++}`);
  return { sql: convertedSql, params };
}

// API: 登录/注册
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const { sql, params } = convertSql('SELECT * FROM users WHERE username = ?', [username]);
    const user = await queryOne(sql, params);

    if (user) {
      // 用户存在，验证密码
      if (user.password === password) {
        res.json({ success: true, message: 'Login successful' });
      } else {
        res.status(401).json({ error: 'Invalid password' });
      }
    } else {
      // 用户不存在，创建新用户
      const { sql: insertSql, params: insertParams } = convertSql(
        'INSERT INTO users (username, password) VALUES (?, ?)',
        [username, password]
      );
      await execute(insertSql, insertParams);
      res.json({ success: true, message: 'User created and logged in' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 获取用户数据（包括签到记录）
app.get('/api/users', async (req, res) => {
  try {
    const users = await query('SELECT username, password FROM users');
    const checkins = await query('SELECT username, date, activity FROM checkins');

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
app.post('/api/checkin', async (req, res) => {
  const { username, date, activity } = req.body;

  if (!username || !date || !activity) {
    return res.status(400).json({ error: 'Username, date, and activity required' });
  }

  try {
    // 检查是否已经签到过这个活动
    const { sql: selectSql, params: selectParams } = convertSql(
      'SELECT * FROM checkins WHERE username = ? AND date = ? AND activity = ?',
      [username, date, activity]
    );
    const existing = await queryOne(selectSql, selectParams);

    if (existing) {
      return res.status(400).json({ error: 'Already checked in for this activity today' });
    }

    const { sql: insertSql, params: insertParams } = convertSql(
      'INSERT INTO checkins (username, date, activity) VALUES (?, ?, ?)',
      [username, date, activity]
    );
    await execute(insertSql, insertParams);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 删除签到
app.delete('/api/checkin', async (req, res) => {
  const { username, date, activity } = req.body;

  if (!username || !date || !activity) {
    return res.status(400).json({ error: 'Username, date, and activity required' });
  }

  try {
    const { sql, params } = convertSql(
      'DELETE FROM checkins WHERE username = ? AND date = ? AND activity = ?',
      [username, date, activity]
    );
    await execute(sql, params);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 删除用户
app.delete('/api/user/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const { sql: deleteCheckinsSql, params: deleteCheckinsParams } = convertSql(
      'DELETE FROM checkins WHERE username = ?',
      [username]
    );
    await execute(deleteCheckinsSql, deleteCheckinsParams);

    const { sql: deleteUserSql, params: deleteUserParams } = convertSql(
      'DELETE FROM users WHERE username = ?',
      [username]
    );
    await execute(deleteUserSql, deleteUserParams);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 导入数据
app.post('/api/import', async (req, res) => {
  const usersData = req.body;

  try {
    if (usePostgres) {
      // PostgreSQL 事务
      await db.query('BEGIN');

      try {
        await db.query('DELETE FROM checkins');
        await db.query('DELETE FROM users');

        for (const [username, userData] of Object.entries(usersData)) {
          await db.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, userData.password]);

          if (userData.checkins) {
            for (const [date, activities] of Object.entries(userData.checkins)) {
              const activityArray = Array.isArray(activities) ? activities : [activities];
              for (const activity of activityArray) {
                await db.query('INSERT INTO checkins (username, date, activity) VALUES ($1, $2, $3)', [username, date, activity]);
              }
            }
          }
        }

        await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    } else {
      // SQLite 事务
      db.exec('BEGIN TRANSACTION');

      try {
        db.prepare('DELETE FROM checkins').run();
        db.prepare('DELETE FROM users').run();

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
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: 导出数据
app.get('/api/export', async (req, res) => {
  try {
    const users = await query('SELECT username, password FROM users');
    const checkins = await query('SELECT username, date, activity FROM checkins');

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
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Checkmate server running on http://localhost:${PORT}`);
    console.log(`Database: ${usePostgres ? 'PostgreSQL' : 'SQLite'}`);
  });
}).catch(error => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});

// 优雅关闭
process.on('SIGINT', async () => {
  if (usePostgres) {
    await db.end();
  } else {
    db.close();
  }
  process.exit(0);
});

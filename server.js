const http = require('http');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'claude-haiku-4-5-20251001';
const DB_PATH = '/app/data/dashboard.db';

// Inicializar base de datos
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('Error abriendo BD:', err);
  else console.log('✓ Base de datos conectada');
  initDB();
});

function initDB() {
  db.serialize(() => {
    // Tabla de estudiantes
    db.run(`CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY,
      name TEXT,
      instagram TEXT,
      followersStart INTEGER,
      followersNow INTEGER,
      status TEXT,
      week INTEGER,
      lastContact TEXT,
      objective TEXT,
      fear TEXT,
      notes TEXT
    )`);

    // Tabla de tareas
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      studentId INTEGER,
      title TEXT,
      owner TEXT,
      done INTEGER,
      createdAt TEXT
    )`);

    // Tabla de sesiones
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      studentId INTEGER,
      name TEXT,
      date TEXT,
      resumen TEXT,
      tareasZame TEXT,
      tareasAlumna TEXT,
      recomendaciones TEXT,
      mensajeWhatsapp TEXT,
      nombreSesion TEXT
    )`);

    // Tabla de orden
    db.run(`CREATE TABLE IF NOT EXISTS app_order (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);

    console.log('✓ Tablas creadas');
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // API: Obtener todos los datos
  if (req.url === '/api/data' && req.method === 'GET') {
    db.all(`SELECT * FROM students`, (err, students) => {
      db.all(`SELECT * FROM tasks`, (err2, tasks) => {
        db.all(`SELECT * FROM sessions`, (err3, sessions) => {
          db.get(`SELECT value FROM app_order WHERE key='order'`, (err4, orderRow) => {
            const order = orderRow ? JSON.parse(orderRow.value) : (students || []).map(s => s.id);
            const data = { students, tasks, sessions, order };
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            res.end(JSON.stringify(data));
          });
        });
      });
    });
    return;
  }

  // API: Guardar datos
  if (req.url === '/api/save' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);

        // Guardar estudiantes
        if (data.students) {
          db.run(`DELETE FROM students`, () => {
            data.students.forEach(s => {
              db.run(`INSERT OR REPLACE INTO students VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
                [s.id, s.name, s.instagram, s.followersStart, s.followersNow, s.status, s.week, s.lastContact, s.objective, s.fear, s.notes]);
            });
          });
        }

        // Guardar tareas
        if (data.tasks) {
          db.run(`DELETE FROM tasks`, () => {
            data.tasks.forEach(t => {
              db.run(`INSERT OR REPLACE INTO tasks VALUES (?,?,?,?,?,?)`,
                [t.id, t.studentId, t.title, t.owner, t.done ? 1 : 0, t.createdAt]);
            });
          });
        }

        // Guardar sesiones
        if (data.sessions) {
          db.run(`DELETE FROM sessions`, () => {
            data.sessions.forEach(s => {
              db.run(`INSERT OR REPLACE INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [s.id, s.studentId, s.name, s.date, JSON.stringify(s.resumen), JSON.stringify(s.tareasZame),
                 JSON.stringify(s.tareasAlumna), JSON.stringify(s.recomendaciones), s.mensajeWhatsapp, s.nombreSesion]);
            });
          });
        }

        // Guardar orden
        if (data.order) {
          db.run(`DELETE FROM app_order WHERE key='order'`, () => {
            db.run(`INSERT INTO app_order VALUES ('order', ?)`, [JSON.stringify(data.order)]);
          });
        }

        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Proxy Anthropic
  if (req.url === '/api/ai' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { system, user } = JSON.parse(body);
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 1500,
            system: system,
            messages: [{ role: 'user', content: user }]
          })
        });
        const data = await response.json();
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(response.status);
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Servir archivos estáticos
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
    res.setHeader('Content-Type', types[path.extname(filePath)] || 'text/plain');
    res.writeHead(200);
    res.end(data);
  });
});

function startOnFreePort(ports) {
  const port = ports.shift();
  server.listen(port, '0.0.0.0')
    .on('listening', () => {
      console.log(`\n  Makyd Academy: http://0.0.0.0:${port}`);
      console.log(`  Modelo: ${MODEL} OK\n`);
    })
    .on('error', () => {
      if (ports.length > 0) startOnFreePort(ports);
      else console.error('No se encontró puerto libre');
    });
}

startOnFreePort([8080, 8081, 8082, 8083, 9000, 9001]);

const fs = require('fs');
const path = require('path');

const SESSION_DIR = process.env.SESSION_DIR || path.join(__dirname, '../../sessions');

function sessionPath(carrier, username) {
  const safe = username.replace(/[^a-z0-9]/gi, '_');
  return path.join(SESSION_DIR, `${carrier}_${safe}.json`);
}

function save(carrier, username, storageState) {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
  fs.writeFileSync(sessionPath(carrier, username), JSON.stringify(storageState));
}

function load(carrier, username) {
  const p = sessionPath(carrier, username);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function clear(carrier, username) {
  const p = sessionPath(carrier, username);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

module.exports = { save, load, clear };

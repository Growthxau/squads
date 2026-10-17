import fs from 'fs';
import path from 'path';

export interface DerivAccountInfo {
  id: string;
  type: 'real' | 'demo';
  currency: string;
  balance: number;
  isVirtual: boolean;
}

export interface DerivConnection {
  encryptedToken: string;
  tokenMask: string;
  connectedAccountId: string;
  connectedAccountType: 'real' | 'demo';
  connectedCurrency: string;
  balance: number;
  accounts: DerivAccountInfo[];
  connectedAt: string;
  lastValidatedAt: string;
  oauth?: {
    expiresAt?: number;
    scope?: string;
    tokenType?: string;
  };
}

export interface BotSettings {
  symbol: string;
  contractType: 'CALL' | 'PUT' | 'BOTH';
  durationTicks: number;
  stake: number;
  maxDailyLoss: number;
  dailyProfitTarget: number;
  isRunning: boolean;
}

export interface DailyStats {
  date: string; // YYYY-MM-DD
  dailyProfitLoss: number;
  totalTrades: number;
  wins: number;
  losses: number;
  hitStopLoss: boolean;
  hitTakeProfit: boolean;
}

export interface User {
  id: string;
  accountNumber: string; // GSQ-610063
  email: string;
  passwordHash: string;
  salt: string;
  isVerified: boolean;
  verificationCode: string;
  verificationCodeExpiresAt: number;
  createdAt: string;
  derivConnection: DerivConnection | null;
  botSettings: BotSettings;
  dailyStats: DailyStats;
}

export interface TradeRecord {
  id: string;
  userId: string;
  accountId: string;
  contractId: string;
  symbol: string;
  contractType: 'CALL' | 'PUT';
  durationTicks: number;
  stake: number;
  payout: number;
  profit: number;
  status: 'won' | 'lost' | 'open';
  entryTick?: number;
  exitTick?: number;
  timestamp: string;
  reason: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  accountNumber: string;
  subject: string;
  category: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved';
  createdAt: string;
}

interface DatabaseSchema {
  users: Record<string, User>;
  trades: TradeRecord[];
  tickets: SupportTicket[];
}

const DB_DIR = path.join(process.cwd(), '.data');
const DB_FILE = path.join(DB_DIR, 'gsquad.json');

function getTodayString(): string {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function initDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading DB, initializing fresh:', err);
  }
  const initial: DatabaseSchema = {
    users: {},
    trades: [],
    tickets: [],
  };
  saveDb(initial);
  return initial;
}

let dbCache: DatabaseSchema | null = null;
let lastDbMtime = 0;

function getDb(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const stats = fs.statSync(DB_FILE);
      if (!dbCache || stats.mtimeMs > lastDbMtime) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        dbCache = JSON.parse(raw);
        lastDbMtime = stats.mtimeMs;
      }
    } else if (!dbCache) {
      dbCache = initDb();
    }
  } catch (err) {
    if (!dbCache) {
      dbCache = initDb();
    }
  }
  return dbCache!;
}

function saveDb(data: DatabaseSchema) {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, DB_FILE);
    dbCache = data;
    try {
      lastDbMtime = fs.statSync(DB_FILE).mtimeMs;
    } catch {}
  } catch (err) {
    console.error('Error saving DB:', err);
  }
}

// User CRUD
export function findUserByEmail(email: string): User | null {
  const db = getDb();
  const normalized = email.toLowerCase().trim();
  for (const user of Object.values(db.users)) {
    if (user.email.toLowerCase().trim() === normalized) {
      return checkAndResetDailyStats(user);
    }
  }
  return null;
}

export function findUserById(id: string): User | null {
  const db = getDb();
  const user = db.users[id];
  if (!user) return null;
  return checkAndResetDailyStats(user);
}

export function findUserByDerivAccountId(accountId: string): User | null {
  const db = getDb();
  const target = accountId.trim();
  for (const user of Object.values(db.users)) {
    if (user.derivConnection?.connectedAccountId === target) {
      return checkAndResetDailyStats(user);
    }
    // Also check all associated accounts
    if (user.derivConnection?.accounts?.some((a) => a.id === target)) {
      return checkAndResetDailyStats(user);
    }
  }
  return null;
}

export function createUser(user: User): User {
  const db = getDb();
  db.users[user.id] = user;
  saveDb(db);
  return user;
}

export function updateUser(id: string, updates: Partial<User>): User | null {
  const db = getDb();
  const user = db.users[id];
  if (!user) return null;
  const updated = { ...user, ...updates };
  db.users[id] = updated;
  saveDb(db);
  return updated;
}

function checkAndResetDailyStats(user: User): User {
  const today = getTodayString();
  if (user.dailyStats.date !== today) {
    const db = getDb();
    user.dailyStats = {
      date: today,
      dailyProfitLoss: 0,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      hitStopLoss: false,
      hitTakeProfit: false,
    };
    db.users[user.id] = user;
    saveDb(db);
  }
  return user;
}

// Trades CRUD
export function addTrade(trade: TradeRecord): TradeRecord {
  const db = getDb();
  db.trades.unshift(trade);
  // Keep last 1000 trades
  if (db.trades.length > 1000) {
    db.trades = db.trades.slice(0, 1000);
  }
  saveDb(db);
  return trade;
}

export function getTradesByUserId(userId: string, limit = 50): TradeRecord[] {
  const db = getDb();
  return db.trades.filter((t) => t.userId === userId).slice(0, limit);
}

// Support Tickets CRUD
export function createTicket(ticket: SupportTicket): SupportTicket {
  const db = getDb();
  db.tickets.unshift(ticket);
  saveDb(db);
  return ticket;
}

export function getTicketsByUserId(userId: string): SupportTicket[] {
  const db = getDb();
  return db.tickets.filter((t) => t.userId === userId);
}

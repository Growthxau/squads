import WebSocket from 'ws';
import { decryptData } from '../crypto';
import {
  findUserById,
  updateUser,
  addTrade,
  TradeRecord,
  User,
  BotSettings,
} from '../db';
import { getDerivAppId, getDerivWsUrl, DERIV_WS_OPTIONS } from '../deriv/api';
import { DerivTick, DerivOpenContract } from '../deriv/types';

export interface BotTelemetryLog {
  id: string;
  timestamp: string;
  type: 'info' | 'trade' | 'risk' | 'warning' | 'error';
  message: string;
}

export interface EngineState {
  userId: string;
  status: 'IDLE' | 'ANALYZING_TICKS' | 'CALCULATING_PROPOSAL' | 'CONTRACT_ACTIVE' | 'COOLDOWN' | 'HALTED_RISK';
  activeSymbol: string;
  currentStake: number;
  recentTicks: DerivTick[];
  activeContract: DerivOpenContract | null;
  logs: BotTelemetryLog[];
  startedAt: string | null;
  lastTradeTime: number | null;
}

// In-memory active bot sessions
class UserTradingSession {
  private userId: string;
  private ws: WebSocket | null = null;
  private isTerminated = false;
  private tickHistory: DerivTick[] = [];
  private activeContract: DerivOpenContract | null = null;
  private logs: BotTelemetryLog[] = [];
  private status: EngineState['status'] = 'IDLE';
  private startedAt: string | null = null;
  private lastTradeTime: number | null = null;
  private inTradeLock = false;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(userId: string) {
    this.userId = userId;
  }

  public getSnapshot(): EngineState {
    const user = findUserById(this.userId);
    const symbol = user?.botSettings.symbol || 'R_100';
    const stake = user?.botSettings.stake || 5;

    return {
      userId: this.userId,
      status: this.status,
      activeSymbol: symbol,
      currentStake: stake,
      recentTicks: this.tickHistory.slice(-20),
      activeContract: this.activeContract,
      logs: this.logs.slice(-25),
      startedAt: this.startedAt,
      lastTradeTime: this.lastTradeTime,
    };
  }

  private addLog(type: BotTelemetryLog['type'], message: string) {
    const log: BotTelemetryLog = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type,
      message,
    };
    this.logs.push(log);
    if (this.logs.length > 50) {
      this.logs.shift();
    }
  }

  public async start(): Promise<{ success: boolean; error?: string }> {
    const user = findUserById(this.userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (!user.derivConnection || !user.derivConnection.encryptedToken) {
      return { success: false, error: 'No Deriv account connected. Please connect your Deriv PAT first.' };
    }

    // Check risk limits before starting
    if (user.dailyStats.hitStopLoss) {
      return { success: false, error: 'Trading halted: Maximum daily loss limit was reached today.' };
    }
    if (user.dailyStats.hitTakeProfit) {
      return { success: false, error: 'Trading halted: Daily profit target was reached today.' };
    }

    let token = '';
    try {
      token = decryptData(user.derivConnection.encryptedToken);
    } catch {
      return { success: false, error: 'Failed to decrypt Deriv credentials. Please reconnect.' };
    }

    this.isTerminated = false;
    this.startedAt = new Date().toISOString();
    this.status = 'ANALYZING_TICKS';
    this.addLog('info', `G-Squad Autonomous Engine initialized for ${user.accountNumber}.`);
    this.addLog('info', `Connecting to Deriv WebSocket (${getDerivAppId()}) for account ${user.derivConnection.connectedAccountId}...`);

    try {
      this.ws = new WebSocket(getDerivWsUrl(), DERIV_WS_OPTIONS);

      this.ws.on('open', () => {
        this.addLog('info', 'WebSocket connected. Authorizing session...');
        this.ws?.send(
          JSON.stringify({
            authorize: token,
            req_id: 10,
          })
        );

        // Keep-alive ping
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ ping: 1 }));
          }
        }, 25000);
      });

      this.ws.on('message', (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleDerivMessage(msg);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          this.addLog('error', `Message parsing failed: ${message}`);
        }
      });

      this.ws.on('error', (err: Error) => {
        this.addLog('error', `Deriv connection error: ${err.message}`);
        this.stop('Connection error');
      });

      this.ws.on('close', () => {
        if (!this.isTerminated) {
          this.addLog('warning', 'Deriv connection closed unexpectedly.');
          this.stop('Socket closed');
        }
      });

      updateUser(this.userId, {
        botSettings: {
          ...user.botSettings,
          isRunning: true,
        },
      });

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.status = 'IDLE';
      return { success: false, error: message };
    }
  }

  private handleDerivMessage(msg: Record<string, unknown>) {
    if (this.isTerminated) return;

    if (msg.error) {
      const err = msg.error as { message?: string; code?: string };
      this.addLog('error', `Deriv error: ${err.message || 'Unknown error'}`);
      if (err.code === 'AuthorizationRequired' || err.code === 'InvalidToken') {
        this.stop('Invalid token');
      }
      return;
    }

    // 1. Authorize response
    if (msg.msg_type === 'authorize' && msg.authorize) {
      const auth = msg.authorize as { loginid: string; balance: number; currency: string };
      this.addLog('info', `Authorized as ${auth.loginid}. Subscribing to synthetic ticks...`);
      
      const user = findUserById(this.userId);
      const symbol = user?.botSettings.symbol || 'R_100';

      // Subscribe to ticks
      this.ws?.send(
        JSON.stringify({
          ticks: symbol,
          subscribe: 1,
          req_id: 20,
        })
      );
    }

    // 2. Tick stream updates
    if (msg.msg_type === 'tick' && msg.tick) {
      const tickData = msg.tick as { symbol: string; quote: number; epoch: number; id?: string };
      const tick: DerivTick = {
        symbol: tickData.symbol,
        quote: tickData.quote,
        epoch: tickData.epoch,
        id: tickData.id,
      };

      this.tickHistory.push(tick);
      if (this.tickHistory.length > 50) {
        this.tickHistory.shift();
      }

      // If currently in a contract, update spot
      if (this.activeContract && this.status === 'CONTRACT_ACTIVE') {
        this.activeContract.current_spot = tick.quote;
      }

      // Check whether to evaluate strategy
      if (this.status === 'ANALYZING_TICKS' && !this.inTradeLock) {
        this.evaluateStrategy();
      }
    }

    // 3. Proposal response
    if (msg.msg_type === 'proposal' && msg.proposal) {
      const proposal = msg.proposal as { id: string; ask_price: number; payout: number; spot: number };
      this.addLog('info', `Proposal received #${proposal.id}. Stake: $${proposal.ask_price} | Payout: $${proposal.payout}`);
      this.executeBuy(proposal.id, proposal.ask_price);
    }

    // 4. Buy response
    if (msg.msg_type === 'buy' && msg.buy) {
      const buy = msg.buy as { contract_id: number; buy_price: number; payout: number; balance_after?: number };
      this.status = 'CONTRACT_ACTIVE';
      this.activeContract = {
        contract_id: buy.contract_id,
        buy_price: buy.buy_price,
        payout: buy.payout,
        profit: 0,
        status: 'open',
        is_sold: 0,
        is_expired: 0,
        current_spot: this.tickHistory[this.tickHistory.length - 1]?.quote,
      };

      this.addLog('trade', `Contract #${buy.contract_id} opened: 5-tick Rise/Fall. Monitoring tick execution...`);

      // Subscribe to contract result
      this.ws?.send(
        JSON.stringify({
          proposal_open_contract: 1,
          contract_id: buy.contract_id,
          subscribe: 1,
          req_id: 30,
        })
      );
    }

    // 5. Open contract update
    if (msg.msg_type === 'proposal_open_contract' && msg.proposal_open_contract) {
      const contract = msg.proposal_open_contract as {
        contract_id: number;
        buy_price: number;
        payout: number;
        profit: number;
        status: string;
        is_sold: number;
        is_expired: number;
        entry_spot?: number;
        exit_spot?: number;
        current_spot?: number;
        tick_count?: number;
      };

      if (this.activeContract && this.activeContract.contract_id === contract.contract_id) {
        this.activeContract.profit = contract.profit;
        this.activeContract.entry_spot = contract.entry_spot;
        this.activeContract.exit_spot = contract.exit_spot;
        this.activeContract.current_spot = contract.current_spot;
        this.activeContract.tick_count = contract.tick_count;

        // Contract settlement
        if (contract.is_sold === 1 || contract.is_expired === 1) {
          this.handleContractSettlement(contract);
        }
      }
    }
  }

  /**
   * Quantitative strategy evaluation:
   * Examines tick momentum, directionality, and volatility threshold.
   * Skips unsuitable or choppy conditions.
   */
  private evaluateStrategy() {
    if (this.tickHistory.length < 10) {
      return; // Await initial rolling tick buffer
    }

    const user = findUserById(this.userId);
    if (!user) return;

    // Check risk limits before evaluating any trade
    const { dailyProfitLoss, hitStopLoss, hitTakeProfit } = user.dailyStats;
    const { maxDailyLoss, dailyProfitTarget, stake, symbol, contractType } = user.botSettings;

    if (dailyProfitLoss <= -maxDailyLoss || hitStopLoss) {
      this.status = 'HALTED_RISK';
      this.addLog('risk', `Max daily loss limit ($${maxDailyLoss.toFixed(2)}) reached! Stopping engine.`);
      this.stop('Daily loss limit reached');
      updateUser(this.userId, {
        dailyStats: { ...user.dailyStats, hitStopLoss: true },
      });
      return;
    }

    if (dailyProfitLoss >= dailyProfitTarget || hitTakeProfit) {
      this.status = 'HALTED_RISK';
      this.addLog('risk', `Daily profit target ($${dailyProfitTarget.toFixed(2)}) reached! Halting engine.`);
      this.stop('Daily profit target reached');
      updateUser(this.userId, {
        dailyStats: { ...user.dailyStats, hitTakeProfit: true },
      });
      return;
    }

    // Cooldown check (minimum 4 seconds between trade completions)
    if (this.lastTradeTime && Date.now() - this.lastTradeTime < 4000) {
      return;
    }

    // Rolling tick slices
    const lastTicks = this.tickHistory.slice(-8);
    const quotes = lastTicks.map((t) => t.quote);

    // Delta calculations
    const latest = quotes[quotes.length - 1];
    const prev1 = quotes[quotes.length - 2];
    const prev2 = quotes[quotes.length - 3];
    const prev4 = quotes[quotes.length - 5];

    const shortDelta = latest - prev2;
    const mediumDelta = latest - prev4;

    // Compute variance / micro-volatility
    const mean = quotes.reduce((a, b) => a + b, 0) / quotes.length;
    const variance = quotes.reduce((acc, q) => acc + Math.pow(q - mean, 2), 0) / quotes.length;
    const stdDev = Math.sqrt(variance);

    // Check for market stagnation or erratic spread
    if (stdDev === 0) {
      // Unsuitable market condition: zero volatility
      return;
    }

    let tradeDirection: 'CALL' | 'PUT' | null = null;

    // Bullish momentum: 3 consecutive rising ticks with positive medium-term momentum
    if (latest > prev1 && prev1 > prev2 && mediumDelta > 0) {
      tradeDirection = 'CALL';
    }
    // Bearish momentum: 3 consecutive falling ticks with negative medium-term momentum
    else if (latest < prev1 && prev1 < prev2 && mediumDelta < 0) {
      tradeDirection = 'PUT';
    }

    // Respect user setting if restricted to CALL or PUT only
    if (tradeDirection) {
      if (contractType === 'CALL' && tradeDirection !== 'CALL') {
        tradeDirection = null;
      } else if (contractType === 'PUT' && tradeDirection !== 'PUT') {
        tradeDirection = null;
      }
    }

    if (tradeDirection) {
      this.inTradeLock = true;
      this.status = 'CALCULATING_PROPOSAL';
      this.addLog('info', `High-probability ${tradeDirection} momentum signal detected on ${symbol}. Requesting 5-tick proposal...`);

      const currency = user.derivConnection?.connectedCurrency || 'USD';

      // Request proposal for 5 ticks
      this.ws?.send(
        JSON.stringify({
          proposal: 1,
          amount: stake,
          basis: 'stake',
          contract_type: tradeDirection,
          currency,
          symbol,
          duration: 5,
          duration_unit: 't',
          req_id: 25,
        })
      );
    }
  }

  private executeBuy(proposalId: string, askPrice: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.inTradeLock = false;
      this.status = 'ANALYZING_TICKS';
      return;
    }

    this.addLog('info', `Purchasing contract at $${askPrice}...`);
    this.ws.send(
      JSON.stringify({
        buy: proposalId,
        price: askPrice,
        req_id: 26,
      })
    );
  }

  private handleContractSettlement(contract: {
    contract_id: number;
    buy_price: number;
    payout: number;
    profit: number;
    status: string;
    entry_spot?: number;
    exit_spot?: number;
  }) {
    const isWin = contract.profit > 0;
    const profitFormatted = (contract.profit >= 0 ? `+$${contract.profit.toFixed(2)}` : `-$${Math.abs(contract.profit).toFixed(2)}`);

    this.addLog(
      'trade',
      `Contract #${contract.contract_id} closed: ${isWin ? 'WON' : 'LOST'} (${profitFormatted}) | 5 ticks completed.`
    );

    const user = findUserById(this.userId);
    if (user) {
      const newProfitLoss = Number((user.dailyStats.dailyProfitLoss + contract.profit).toFixed(2));
      const totalTrades = user.dailyStats.totalTrades + 1;
      const wins = user.dailyStats.wins + (isWin ? 1 : 0);
      const losses = user.dailyStats.losses + (isWin ? 0 : 1);

      const hitStopLoss = newProfitLoss <= -user.botSettings.maxDailyLoss;
      const hitTakeProfit = newProfitLoss >= user.botSettings.dailyProfitTarget;

      // Update user stats
      updateUser(this.userId, {
        dailyStats: {
          ...user.dailyStats,
          dailyProfitLoss: newProfitLoss,
          totalTrades,
          wins,
          losses,
          hitStopLoss,
          hitTakeProfit,
        },
      });

      // Save trade to persistent records
      const tradeRecord: TradeRecord = {
        id: `TRD-${Date.now()}-${contract.contract_id}`,
        userId: this.userId,
        accountId: user.derivConnection?.connectedAccountId || 'UNKNOWN',
        contractId: String(contract.contract_id),
        symbol: user.botSettings.symbol,
        contractType: contract.profit >= 0 ? 'CALL' : 'PUT',
        durationTicks: 5,
        stake: contract.buy_price,
        payout: contract.payout,
        profit: contract.profit,
        status: isWin ? 'won' : 'lost',
        entryTick: contract.entry_spot,
        exitTick: contract.exit_spot,
        timestamp: new Date().toISOString(),
        reason: '5-tick momentum quantitative rule execution',
      };
      addTrade(tradeRecord);

      // Check risk limit triggers
      if (hitStopLoss) {
        this.addLog('risk', `Max daily loss limit of $${user.botSettings.maxDailyLoss.toFixed(2)} reached. Halting.`);
        this.stop('Daily loss limit reached');
        return;
      }
      if (hitTakeProfit) {
        this.addLog('risk', `Daily profit target of $${user.botSettings.dailyProfitTarget.toFixed(2)} hit! Halting.`);
        this.stop('Daily profit target reached');
        return;
      }
    }

    // Cooldown state
    this.status = 'COOLDOWN';
    this.activeContract = null;
    this.lastTradeTime = Date.now();

    setTimeout(() => {
      if (!this.isTerminated) {
        this.inTradeLock = false;
        this.status = 'ANALYZING_TICKS';
        this.addLog('info', 'Market analysis resumed. Scanning ticks...');
      }
    }, 4000);
  }

  public stop(reason = 'User stopped bot') {
    this.isTerminated = true;
    this.status = 'IDLE';
    this.inTradeLock = false;
    this.activeContract = null;

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.ws) {
      try {
        // Forget ticks
        this.ws.send(JSON.stringify({ forget_all: 'ticks' }));
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    this.addLog('info', `G-Squad Engine stopped: ${reason}.`);

    const user = findUserById(this.userId);
    if (user) {
      updateUser(this.userId, {
        botSettings: {
          ...user.botSettings,
          isRunning: false,
        },
      });
    }
  }
}

// Global active sessions registry
const activeSessions = new Map<string, UserTradingSession>();

export function getOrCreateSession(userId: string): UserTradingSession {
  let session = activeSessions.get(userId);
  if (!session) {
    session = new UserTradingSession(userId);
    activeSessions.set(userId, session);
  }
  return session;
}

export function startTradingBot(userId: string): Promise<{ success: boolean; error?: string }> {
  const session = getOrCreateSession(userId);
  return session.start();
}

export function stopTradingBot(userId: string, reason?: string) {
  const session = activeSessions.get(userId);
  if (session) {
    session.stop(reason);
  }
}

export function getEngineState(userId: string): EngineState {
  const session = getOrCreateSession(userId);
  return session.getSnapshot();
}

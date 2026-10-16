'use client';

import React from 'react';
import { DerivTick, DerivOpenContract } from '@/lib/deriv/types';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface TradingChartProps {
  symbol: string;
  ticks: DerivTick[];
  activeContract: DerivOpenContract | null;
  botStatus: string;
}

export function TradingChart({ symbol, ticks, activeContract, botStatus }: TradingChartProps) {
  if (!ticks || ticks.length === 0) {
    return (
      <div className="h-48 flex flex-col items-center justify-center bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
        <Activity className="w-8 h-8 mb-2 animate-pulse text-slate-300" />
        <span>Awaiting market tick stream for {symbol}...</span>
        <span className="text-xs text-slate-400 mt-1">Start bot or connect account to activate live feed</span>
      </div>
    );
  }

  const quotes = ticks.map((t) => t.quote);
  const min = Math.min(...quotes);
  const max = Math.max(...quotes);
  const range = max - min || 1;
  const latestQuote = quotes[quotes.length - 1];
  const prevQuote = quotes.length > 1 ? quotes[quotes.length - 2] : latestQuote;
  const delta = latestQuote - prevQuote;
  const isUp = delta >= 0;

  // Generate SVG path points
  const width = 600;
  const height = 150;
  const paddingY = 20;

  const points = quotes.map((q, i) => {
    const x = (i / (quotes.length - 1 || 1)) * width;
    const y = height - paddingY - ((q - min) / range) * (height - 2 * paddingY);
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

  // Contract entry spot Y coordinate
  let entrySpotY: number | null = null;
  if (activeContract?.entry_spot) {
    entrySpotY = height - paddingY - ((activeContract.entry_spot - min) / range) * (height - 2 * paddingY);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      {/* Header Info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">{symbol}</span>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500">Synthetic 5-Tick Feed</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-mono font-bold ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
            {latestQuote.toFixed(2)}
          </span>
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-mono font-medium ${
              isUp ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Real-time SVG Chart */}
      <div className="relative w-full h-36 overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaD} fill="url(#chartGradient)" />

          {/* Grid lines */}
          <line x1="0" y1={height / 4} x2={width} y2={height / 4} stroke="#f1f5f9" strokeDasharray="4 4" />
          <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#f1f5f9" strokeDasharray="4 4" />
          <line x1="0" y1={(height * 3) / 4} x2={width} y2={(height * 3) / 4} stroke="#f1f5f9" strokeDasharray="4 4" />

          {/* Contract Entry Spot Marker */}
          {entrySpotY !== null && entrySpotY >= 0 && entrySpotY <= height && (
            <g>
              <line
                x1="0"
                y1={entrySpotY}
                x2={width}
                y2={entrySpotY}
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <text x="6" y={entrySpotY - 4} fill="#d97706" fontSize="10" fontWeight="bold">
                Entry Spot: {activeContract?.entry_spot?.toFixed(2)}
              </text>
            </g>
          )}

          {/* Line stroke */}
          <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

          {/* Latest Tick Pulse Circle */}
          {points.length > 0 && (
            <circle
              cx={width}
              cy={height - paddingY - ((latestQuote - min) / range) * (height - 2 * paddingY)}
              r="4.5"
              fill={isUp ? '#10b981' : '#f43f5e'}
              stroke="#ffffff"
              strokeWidth="2"
            />
          )}
        </svg>
      </div>

      {/* Active Contract Overlay Bar */}
      {activeContract && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            <span className="font-semibold text-slate-800">
              Contract #{activeContract.contract_id} Active
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">Stake: ${activeContract.buy_price.toFixed(2)}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-600">Payout: ${activeContract.payout.toFixed(2)}</span>
          </div>
          <div>
            <span
              className={`font-mono font-bold ${
                activeContract.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              Running P&L: {activeContract.profit >= 0 ? `+$${activeContract.profit.toFixed(2)}` : `-$${Math.abs(activeContract.profit).toFixed(2)}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

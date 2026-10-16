export interface DerivAuthorizeAccountItem {
  account_category: string;
  account_type: string;
  currency: string;
  is_disabled: number;
  is_virtual: number;
  landing_company_name: string;
  loginid: string;
}

export interface DerivAuthorizeResponse {
  account_list: DerivAuthorizeAccountItem[];
  balance: number;
  currency: string;
  email: string;
  fullname?: string;
  is_virtual: number;
  loginid: string;
  scopes: string[];
  user_id?: number;
}

export interface DerivValidationResult {
  success: boolean;
  error?: string;
  details?: {
    loginid: string;
    currency: string;
    balance: number;
    isVirtual: boolean;
    scopes: string[];
    accounts: Array<{
      id: string;
      type: 'real' | 'demo';
      currency: string;
      balance: number;
      isVirtual: boolean;
    }>;
  };
}

export interface DerivTick {
  symbol: string;
  quote: number;
  epoch: number;
  id?: string;
}

export interface DerivContractProposal {
  id: string;
  ask_price: number;
  payout: number;
  spot: number;
  spot_time: number;
}

export interface DerivOpenContract {
  contract_id: number;
  buy_price: number;
  payout: number;
  profit: number;
  status: 'open' | 'won' | 'lost';
  is_sold: number;
  is_expired: number;
  entry_spot?: number;
  exit_spot?: number;
  current_spot?: number;
  tick_count?: number;
  date_expiry?: number;
  barrier?: string;
}

import 'server-only';

// Coin reward persistence belongs to the repository layer. Keep this stable
// application-facing seam for API routes and UI consumers.
export {
  listCoinRewards,
  getEquippedCoinReward,
  redeemCoinReward,
  equipCoinReward,
} from '../repositories/coinRewards.js';

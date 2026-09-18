const crypto = require("node:crypto");

const REWARD_DEFINITIONS = [
  { id: "fries", points: 200, title: "Une portion de frites offerte" },
  { id: "drink", points: 400, title: "Une boisson fraîche offerte" },
  { id: "discount-5", points: 700, title: "5 € de remise" },
  { id: "classic-menu", points: 1500, title: "Un menu classique offert" },
  { id: "duo-menu", points: 5000, title: "Un menu pour deux offert" },
];

const rewardError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const ensureRewardStore = (database) => {
  let changed = false;
  if (!Array.isArray(database.rewardClaims)) {
    database.rewardClaims = [];
    changed = true;
  }
  if (!Number.isInteger(database.nextRewardClaimNumber) || database.nextRewardClaimNumber < 1) {
    const highest = database.rewardClaims.reduce((value, claim) => Math.max(value, Number(claim.number) || 0), 0);
    database.nextRewardClaimNumber = highest + 1;
    changed = true;
  }
  return changed;
};

const createRewardCode = (database) => {
  const usedCodes = new Set((database.rewardClaims || []).map((claim) => claim.code));
  let code;
  do {
    code = `BIBOU-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  } while (usedCodes.has(code));
  return code;
};

const rewardClaimsForCustomer = (database, customerId) => {
  ensureRewardStore(database);
  return database.rewardClaims
    .filter((claim) => claim.customerId === customerId)
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
};

const claimReward = (database, customer, rewardId, value = new Date()) => {
  ensureRewardStore(database);
  const reward = REWARD_DEFINITIONS.find((item) => item.id === rewardId);
  if (!reward) throw rewardError("Cette récompense n’existe pas.", 404);
  if ((Number(customer?.points) || 0) < reward.points) throw rewardError(`Il faut ${reward.points} points pour réclamer cette récompense.`);
  if (database.rewardClaims.some((claim) => claim.customerId === customer.id && claim.rewardId === reward.id)) {
    throw rewardError("Cette récompense a déjà été réclamée.", 409);
  }

  const number = database.nextRewardClaimNumber++;
  const claim = {
    id: `reward-claim-${number}`,
    number,
    code: createRewardCode(database),
    customerId: customer.id,
    customerName: customer.name || "Client Bibou",
    rewardId: reward.id,
    rewardTitle: reward.title,
    requiredPoints: reward.points,
    status: "active",
    createdAt: value.toISOString(),
  };
  database.rewardClaims.unshift(claim);
  return claim;
};

const updateRewardClaimStatus = (database, claimId, status, value = new Date()) => {
  ensureRewardStore(database);
  if (!['used', 'cancelled'].includes(status)) throw rewardError("Statut de récompense invalide.");
  const claim = database.rewardClaims.find((item) => item.id === claimId);
  if (!claim) return null;
  if (claim.status === status) return claim;
  if (claim.status !== "active") throw rewardError("Cette récompense a déjà été traitée.", 409);
  claim.status = status;
  claim.updatedAt = value.toISOString();
  if (status === "used") claim.usedAt = claim.updatedAt;
  if (status === "cancelled") claim.cancelledAt = claim.updatedAt;
  return claim;
};

module.exports = {
  REWARD_DEFINITIONS,
  claimReward,
  ensureRewardStore,
  rewardClaimsForCustomer,
  updateRewardClaimStatus,
};

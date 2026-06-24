import {
  buildPrizePool,
  pickPrize,
  canReceivePrize,
  allocatePrize
} from "./prize.js";

import {
  randomPick
} from "./random.js";

/**
 * MAIN ORCHESTRATOR
 *
 * Flow:
 * 1. Load data
 * 2. Pick prize (prize-centric)
 * 3. Pick winner (random under constraint)
 * 4. Validate rule
 * 5. Allocate
 * 6. Return result
 */


/**
 * RUN 1 DRAW ROUND
 */
export function runLuckyDraw({
  rawParticipants,
  rawPrizes,
  history = []
}) {

  /**
   * =================================================
   * 1. BUILD PRIZE POOL
   * =================================================
   */
  const prizePool =
    buildPrizePool(rawPrizes);


  /**
   * =================================================
   * 2. PICK PRIZE FIRST (IMPORTANT CHANGE)
   * =================================================
   */
  const prize =
    pickPrize(prizePool);

  if (!prize) {

    return {
      success: false,
      message: "No prize available"
    };

  }


  /**
   * =================================================
   * 3. FILTER ELIGIBLE PARTICIPANTS
   * =================================================
   *
   * Randomizer không chọn bừa
   * mà phải filter theo rule của prize
   */
  const eligibleParticipants =
    rawParticipants.filter(user => {

      return canReceivePrize({
        customerId: user.id,
        prize,
        history
      });

    });


  if (!eligibleParticipants.length) {

    return {
      success: false,
      message: "No eligible participants for this prize",
      prize
    };

  }


  /**
   * =================================================
   * 4. PICK WINNER (RANDOM)
   * =================================================
   */
  const winner =
    randomPick(eligibleParticipants);


  /**
   * =================================================
   * 5. FINAL VALIDATION (SAFETY LAYER)
   * =================================================
   */
  const canWin =
    canReceivePrize({
      customerId: winner.id,
      prize,
      history
    });

  if (!canWin) {

    return {
      success: false,
      message: "Rule violation after selection",
      prize
    };

  }


  /**
   * =================================================
   * 6. ALLOCATE PRIZE
   * =================================================
   */
  const allocation =
    allocatePrize({
      prizePool,
      prizeCode: prize.prizeCode,
      customerId: winner.id,
      history
    });


  /**
   * =================================================
   * 7. RETURN RESULT
   * =================================================
   */
  return {

    success: true,

    winner: {
      id: winner.id,
      name: winner.name
    },

    prize: {
      code: prize.prizeCode,
      name: prize.prizeName
    },

    allocation

  };

}


/**
 * =====================================================
 * OPTIONAL: RUN FULL CAMPAIGN (AUTO SEQUENCE MODE)
 * =====================================================
 *
 * Dùng khi:
 * - quay tự động 1000 giải
 * - chạy event offline
 */
export function runCampaign({
  rawParticipants,
  rawPrizes
}) {

  const history = [];
  const results = [];

  const prizePool =
    buildPrizePool(rawPrizes);

  while (true) {

    const availablePrizes =
      prizePool.filter(
        p => p.remainingQuantity > 0
      );

    if (!availablePrizes.length) {
      break;
    }

    const prize =
      pickPrize(prizePool);

    if (!prize) break;

    const eligible =
      rawParticipants.filter(user =>
        canReceivePrize({
          customerId: user.id,
          prize,
          history
        })
      );

    if (!eligible.length) continue;

    const winner =
      randomPick(eligible);

    const allocation =
      allocatePrize({
        prizePool,
        prizeCode: prize.prizeCode,
        customerId: winner.id,
        history
      });

    results.push({
      winner,
      prize,
      allocation
    });

  }

  return {
    total: results.length,
    results
  };

}
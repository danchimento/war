const { createDeck, shuffle, playWarGame, percentile, stddev, upgradeEffects, upgradeTriggers, UPGRADE_CATALOG, applyUpgrade, cardValue } = require('./war-simulation');

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    failures.push(testName);
    console.log(`  ✗ ${testName}`);
  }
}

function assertEq(actual, expected, testName) {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    failures.push(`${testName} (expected ${expected}, got ${actual})`);
    console.log(`  ✗ ${testName} (expected ${expected}, got ${actual})`);
  }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ============================================================
// DECK CREATION
// ============================================================
section('createDeck');

(() => {
  const deck = createDeck();
  assertEq(deck.length, 52, 'Deck has 52 cards');

  // Each rank 2-14 should appear exactly 4 times
  for (let rank = 2; rank <= 14; rank++) {
    const count = deck.filter(c => c === rank).length;
    assertEq(count, 4, `Rank ${rank} appears 4 times`);
  }

  // No rank outside 2-14
  const outOfRange = deck.filter(c => c < 2 || c > 14);
  assertEq(outOfRange.length, 0, 'No cards outside rank range 2-14');
})();

// ============================================================
// SHUFFLE
// ============================================================
section('shuffle');

(() => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const original = [...arr];
  shuffle(arr);

  assertEq(arr.length, original.length, 'Shuffle preserves array length');

  const sortedOriginal = [...original].sort((a, b) => a - b);
  const sortedShuffled = [...arr].sort((a, b) => a - b);
  assertEq(JSON.stringify(sortedShuffled), JSON.stringify(sortedOriginal), 'Shuffle preserves all elements');

  // Run shuffle many times and check it's not always the same
  let identicalCount = 0;
  for (let i = 0; i < 20; i++) {
    const test = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    shuffle(test);
    if (JSON.stringify(test) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])) identicalCount++;
  }
  assert(identicalCount < 20, 'Shuffle actually reorders elements (not identity every time)');
})();

// ============================================================
// BASIC GAME MECHANICS: Higher card wins
// ============================================================
section('Basic mechanics: higher card wins');

(() => {
  // P1 has all high cards, P2 has all low cards. P1 should always win.
  // P1: [14, 14, 14, 14, 13, 13] P2: [2, 2, 2, 2, 3, 3]
  // Turn 1: 14 vs 2 → P1 wins. Turn 2: 14 vs 2 → P1 wins. etc.
  const p1 = [14, 13, 12, 11, 10];
  const p2 = [2, 3, 4, 5, 6];
  const result = playWarGame({ p1Hand: p1, p2Hand: p2 });

  assertEq(result.winner, 1, 'Player with all higher cards wins');
  assertEq(result.turns, 5, 'Game ends in 5 turns (one per card pair)');
  assertEq(result.wars, 0, 'No wars when no ties');
  assertEq(result.p2Remaining, 0, 'Loser has 0 cards');
  assertEq(result.p1Remaining, 10, 'Winner has all 10 cards');
  assertEq(result.p1HandWins, 5, 'P1 won all 5 hands');
  assertEq(result.p2HandWins, 0, 'P2 won 0 hands');
  assertEq(result.warEndedGame, false, 'Game did not end by war');
})();

// ============================================================
// P2 wins when P2 has all higher cards
// ============================================================
section('Basic mechanics: P2 wins with higher cards');

(() => {
  const p1 = [2, 3, 4];
  const p2 = [14, 13, 12];
  const result = playWarGame({ p1Hand: p1, p2Hand: p2 });

  assertEq(result.winner, 2, 'P2 wins when they have all higher cards');
  assertEq(result.turns, 3, 'Game ends in 3 turns');
  assertEq(result.p2HandWins, 3, 'P2 won all 3 hands');
  assertEq(result.p1HandWins, 0, 'P1 won 0 hands');
})();

// ============================================================
// CARD PLACEMENT: Traditional (no shuffle)
// ============================================================
section('Card placement: traditional order (no shuffle)');

(() => {
  // P1: [10, 5], P2: [3, 14]
  // Turn 1: P1 plays 10, P2 plays 3. P1 wins. P1 gets [5, 10, 3] (own cards first, then opponent)
  // Turn 2: P1 plays 5, P2 plays 14. P2 wins. P2 gets [14, 5]
  // Turn 3: P1 plays 10, P2 plays 14. P2 wins. P2 gets [5, 14, 10]
  // Turn 4: P1 plays 3, P2 plays 5. P2 wins.
  const p1 = [10, 5];
  const p2 = [3, 14];
  const result = playWarGame({ p1Hand: p1, p2Hand: p2, shufflePot: false });

  assertEq(result.winner, 2, 'P2 eventually wins this setup');
  assertEq(result.p1HandWins, 1, 'P1 wins exactly 1 hand');
  assert(result.turns > 2, 'Game lasts more than 2 turns due to card recycling');
})();

// ============================================================
// WAR MECHANICS: Single war
// ============================================================
section('War mechanics: single war');

(() => {
  // Set up a tie on the first card, with enough cards for a war
  // P1: [7, A, A, A, 14]  P2: [7, B, B, B, 2]
  // Turn 1: 7 vs 7 → WAR. 3 face-down each, then 14 vs 2 → P1 wins
  // P1 played: 7, A, A, A, 14. P2 played: 7, B, B, B, 2. P1 takes all 10 cards.
  const p1 = [7, 3, 4, 5, 14];
  const p2 = [7, 8, 9, 10, 2];
  const result = playWarGame({ p1Hand: p1, p2Hand: p2 });

  assertEq(result.wars, 1, 'Exactly 1 war occurred');
  assertEq(result.turns, 1, 'War counts as 1 turn');
  assertEq(result.winner, 1, 'P1 wins the war with higher reveal card');
  assertEq(result.p1Remaining, 10, 'Winner collects all 10 cards');
  assertEq(result.p2Remaining, 0, 'Loser has 0 cards');
})();

// ============================================================
// WAR MECHANICS: P2 wins the war
// ============================================================
section('War mechanics: P2 wins the war');

(() => {
  const p1 = [7, 3, 4, 5, 2];
  const p2 = [7, 8, 9, 10, 14];
  const result = playWarGame({ p1Hand: p1, p2Hand: p2 });

  assertEq(result.wars, 1, 'Exactly 1 war occurred');
  assertEq(result.winner, 2, 'P2 wins the war with higher reveal card');
  assertEq(result.p2Remaining, 10, 'P2 collects all 10 cards');
})();

// ============================================================
// WAR MECHANICS: Double war
// ============================================================
section('War mechanics: double war');

(() => {
  // Two consecutive ties
  // P1: [7, x, x, x, 9, x, x, x, 14]  P2: [7, x, x, x, 9, x, x, x, 2]
  const p1 = [7, 3, 3, 3, 9, 3, 3, 3, 14];
  const p2 = [7, 4, 4, 4, 9, 4, 4, 4, 2];
  const result = playWarGame({ p1Hand: p1, p2Hand: p2 });

  assertEq(result.wars, 2, 'Exactly 2 wars occurred');
  assertEq(result.doubleWars, 1, 'Double war counted');
  assertEq(result.turns, 1, 'Double war is still 1 turn');
  assertEq(result.winner, 1, 'P1 wins with the higher final reveal');
  assertEq(result.p1Remaining, 18, 'Winner gets all 18 cards');
})();

// ============================================================
// WAR MECHANICS: Triple war
// ============================================================
section('War mechanics: triple war');

(() => {
  // Three consecutive ties
  const p1 = [7, 3, 3, 3, 9, 3, 3, 3, 11, 3, 3, 3, 14];
  const p2 = [7, 4, 4, 4, 9, 4, 4, 4, 11, 4, 4, 4, 2];
  const result = playWarGame({ p1Hand: p1, p2Hand: p2 });

  assertEq(result.wars, 3, 'Exactly 3 wars occurred');
  assertEq(result.doubleWars, 1, 'Double war counted');
  assertEq(result.tripleWars, 1, 'Triple war counted');
  assertEq(result.turns, 1, 'Triple war is still 1 turn');
  assertEq(result.winner, 1, 'P1 wins');
  assertEq(result.p1Remaining, 26, 'Winner gets all 26 cards');
})();

// ============================================================
// WAR ENDING: Player can't afford a war
// ============================================================
section('War ending: insufficient cards for war');

(() => {
  // P1 has 3 cards, P2 has 5 cards. First cards tie → P1 can't afford war (needs 4 more)
  const p1 = [7, 2, 3];
  const p2 = [7, 8, 9, 10, 14];
  const result = playWarGame({ p1Hand: p1, p2Hand: p2 });

  assertEq(result.warEndedGame, true, 'Game ended due to insufficient cards for war');
  assertEq(result.wars, 1, 'One war was triggered');
  assertEq(result.winner, 2, 'Player with more cards wins');
  assertEq(result.p1Remaining, 0, 'P1 has no cards left');
  assertEq(result.p2Remaining, 8, 'P2 has all 8 cards');
})();

// ============================================================
// WAR ENDING: P2 can't afford a war
// ============================================================
section('War ending: P2 insufficient cards');

(() => {
  const p1 = [7, 8, 9, 10, 14];
  const p2 = [7, 2, 3];
  const result = playWarGame({ p1Hand: p1, p2Hand: p2 });

  assertEq(result.warEndedGame, true, 'Game ended due to P2 insufficient cards');
  assertEq(result.winner, 1, 'P1 wins when P2 cant afford war');
  assertEq(result.p2Remaining, 0, 'P2 has no cards');
})();

// ============================================================
// WAR ENDING: Player has exactly 0 remaining after initial flip
// ============================================================
section('War ending: player has 0 cards after tie flip');

(() => {
  // P1 has exactly 1 card, P2 has 1 card, they tie
  const p1 = [7];
  const p2 = [7];
  const result = playWarGame({ p1Hand: p1, p2Hand: p2 });

  assertEq(result.warEndedGame, true, 'Game ended by war');
  assertEq(result.turns, 1, 'Game lasted 1 turn');
  assertEq(result.wars, 1, 'One war triggered');
})();

// ============================================================
// TURN CAP
// ============================================================
section('Turn cap');

(() => {
  // Use a very small turn cap
  const result = playWarGame({ maxTurns: 5 });

  assert(result.turns <= 5, 'Game respects maxTurns cap');
  assertEq(result.capped, result.turns >= 5, 'Capped flag matches turn count');
})();

// ============================================================
// CARD CONSERVATION: No cards created or destroyed
// ============================================================
section('Card conservation');

(() => {
  // After game ends, total cards should still be 52
  const result = playWarGame();
  assertEq(result.p1Remaining + result.p2Remaining, 52, 'Total cards = 52 after random game');

  // With custom hands
  const p1 = [14, 13, 12, 11, 10, 9];
  const p2 = [2, 3, 4, 5, 6, 7];
  const result2 = playWarGame({ p1Hand: p1, p2Hand: p2 });
  assertEq(result2.p1Remaining + result2.p2Remaining, 12, 'Total cards conserved (12 card game)');

  // With a war scenario
  const p1w = [7, 3, 4, 5, 14, 8];
  const p2w = [7, 8, 9, 10, 2, 6];
  const result3 = playWarGame({ p1Hand: p1w, p2Hand: p2w });
  assertEq(result3.p1Remaining + result3.p2Remaining, 12, 'Total cards conserved after war');
})();

// ============================================================
// STREAKS
// ============================================================
section('Winning streaks');

(() => {
  // P1 wins 4 in a row, then P2 wins the rest
  const p1 = [14, 13, 12, 11, 2, 3, 4];
  const p2 = [2,  3,  4,  5,  14, 13, 12];
  const result = playWarGame({ p1Hand: p1, p2Hand: p2, shufflePot: false });

  assertEq(result.p1MaxStreak, 4, 'P1 max streak is 4 (first 4 wins)');
  assert(result.p2MaxStreak >= 1, 'P2 has at least 1 streak');
})();

// ============================================================
// LEAD TRACKING
// ============================================================
section('Lead tracking');

(() => {
  // P1: [14, 2, 3], P2: [3, 13, 12]
  // Turn 1: 14 vs 3 → P1 wins. P1: [2, 3, 14, 3], P2: [13, 12]. Diff=2, leader=P1.
  // Turn 2: 2 vs 13 → P2 wins. P1: [3, 14], P2: [12, 13, 2]. Diff=-1, leader=P2. LEAD CHANGE!
  const p1 = [14, 2, 3];
  const p2 = [3, 13, 12];
  const result = playWarGame({ p1Hand: p1, p2Hand: p2, shufflePot: false });

  assert(result.p1MaxLead >= 2, 'P1 max lead is at least 2 after winning first hand');
  assert(result.leadChanges >= 1, 'At least 1 lead change in a back-and-forth game');
})();

// ============================================================
// SHUFFLE vs NO-SHUFFLE: Both modes produce valid results
// ============================================================
section('Shuffle vs no-shuffle mode');

(() => {
  const p1 = [14, 2, 10, 3, 12];
  const p2 = [5, 13, 4, 11, 6];

  const noShuf = playWarGame({ p1Hand: p1, p2Hand: p2, shufflePot: false });
  assert(noShuf.turns > 0, 'No-shuffle mode completes');
  assertEq(noShuf.p1Remaining + noShuf.p2Remaining, 10, 'No-shuffle conserves cards');

  const shuf = playWarGame({ p1Hand: p1, p2Hand: p2, shufflePot: true });
  assert(shuf.turns > 0, 'Shuffle mode completes');
  assertEq(shuf.p1Remaining + shuf.p2Remaining, 10, 'Shuffle conserves cards');
})();

// ============================================================
// FULL DECK GAME: Random game sanity checks
// ============================================================
section('Full deck random game sanity');

(() => {
  const result = playWarGame();
  assert(result.turns >= 1, 'Game lasts at least 1 turn');
  assert(result.winner === 1 || result.winner === 2, 'Winner is 1 or 2');
  assertEq(result.p1Remaining + result.p2Remaining, 52, 'All 52 cards accounted for');
  assert(result.p1HandWins + result.p2HandWins <= result.turns, 'Hand wins <= turns');
  assert(result.wars >= 0, 'Wars is non-negative');
  assert(result.doubleWars <= result.wars, 'Double wars <= total wars');
  assert(result.tripleWars <= result.doubleWars, 'Triple wars <= double wars');
  assert(result.p1MaxStreak >= 0, 'P1 streak is non-negative');
  assert(result.p2MaxStreak >= 0, 'P2 streak is non-negative');
  assert(result.p1MaxLead >= 0, 'P1 max lead is non-negative');
  assert(result.p2MaxLead >= 0, 'P2 max lead is non-negative');
  assert(result.leadChanges >= 0, 'Lead changes is non-negative');
})();

// ============================================================
// STAT HELPERS: percentile
// ============================================================
section('percentile()');

(() => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assertEq(percentile(arr, 0), 1, '0th percentile = min');
  assertEq(percentile(arr, 100), 10, '100th percentile = max');
  assertEq(percentile(arr, 50), 5.5, '50th percentile = median of 1-10');
})();

// ============================================================
// STAT HELPERS: stddev
// ============================================================
section('stddev()');

(() => {
  const arr = [5, 5, 5, 5];
  assertEq(stddev(arr, 5), 0, 'Stddev of identical values is 0');

  const arr2 = [2, 4, 4, 4, 5, 5, 7, 9];
  const mean = arr2.reduce((a, b) => a + b, 0) / arr2.length; // 5
  const sd = stddev(arr2, mean);
  assert(Math.abs(sd - 2) < 0.01, 'Stddev of [2,4,4,4,5,5,7,9] is 2');
})();

// ============================================================
// EDGE CASE: Single card each, no tie
// ============================================================
section('Edge case: single card each, no tie');

(() => {
  const result = playWarGame({ p1Hand: [14], p2Hand: [2] });
  assertEq(result.turns, 1, 'Game ends in 1 turn');
  assertEq(result.winner, 1, 'Higher card wins');
  assertEq(result.wars, 0, 'No wars');
  assertEq(result.p1Remaining, 2, 'Winner has both cards');
})();

// ============================================================
// EDGE CASE: Exactly 4 cards each with a tie (just enough for war)
// ============================================================
section('Edge case: exactly 4 cards each with tie (bare minimum for war)');

(() => {
  // P1: [7, x, x, x]  P2: [7, x, x, x] — not enough! need 4 MORE after the tie card
  // Actually after the tie flip, each has 3 remaining, which is < 4. So this should be war-ended.
  const result = playWarGame({ p1Hand: [7, 2, 3, 4], p2Hand: [7, 5, 6, 8] });
  assertEq(result.warEndedGame, true, 'War ends game when players have only 3 cards left after tie');
  assertEq(result.wars, 1, 'War was triggered');
})();

// ============================================================
// EDGE CASE: Exactly 5 cards each with a tie (just enough for one war)
// ============================================================
section('Edge case: exactly 5 cards each (just enough for war)');

(() => {
  // After tie flip: 4 remaining each. 3 face-down + 1 reveal = exactly 4.
  const result = playWarGame({ p1Hand: [7, 2, 3, 4, 14], p2Hand: [7, 5, 6, 8, 2] });
  assertEq(result.warEndedGame, false, 'Game does NOT end by war — enough cards');
  assertEq(result.wars, 1, 'Exactly 1 war');
  assertEq(result.winner, 1, 'P1 wins with 14 vs 2 reveal');
})();

// ============================================================
// HAND WINS + WARS = TURNS (for non-war-ended games)
// ============================================================
section('Invariant: handWins == turns when no wars end the game');

(() => {
  // Simple game with no ties
  const p1 = [14, 12, 10, 8, 6];
  const p2 = [13, 11, 9, 7, 5];
  const result = playWarGame({ p1Hand: p1, p2Hand: p2 });

  assertEq(result.wars, 0, 'No wars in this game');
  assertEq(result.p1HandWins + result.p2HandWins, result.turns, 'Total hand wins equals total turns (no wars)');
})();

// ============================================================
// MULTIPLE RANDOM GAMES: Statistical sanity
// ============================================================
section('Statistical sanity over 50 random games');

(() => {
  const results = [];
  for (let i = 0; i < 50; i++) results.push(playWarGame());

  const p1Wins = results.filter(r => r.winner === 1).length;
  const p2Wins = results.filter(r => r.winner === 2).length;

  assertEq(p1Wins + p2Wins, 50, 'Every game has a winner');

  const allConserved = results.every(r => r.p1Remaining + r.p2Remaining === 52);
  assert(allConserved, 'All 50 games conserve 52 cards');

  const avgTurns = results.reduce((s, r) => s + r.turns, 0) / 50;
  assert(avgTurns > 50, 'Average turns > 50 (sanity)');
  assert(avgTurns < 5000, 'Average turns < 5000 (sanity)');
})();

// ============================================================
// UPGRADE: No upgrade = no bonus (backward compat)
// ============================================================
section('Upgrade: no upgrade option preserves original behavior');

(() => {
  const p1 = [14, 13, 12, 11, 10];
  const p2 = [2, 3, 4, 5, 6];
  const result = playWarGame({ p1Hand: p1, p2Hand: p2 });
  assertEq(result.p1UpgradeLevel, 0, 'P1 upgrade level is 0 without upgrade option');
  assertEq(result.p2UpgradeLevel, 0, 'P2 upgrade level is 0 without upgrade option');
  assertEq(result.p1TotalUpgrades, 0, 'P1 total upgrades is 0');
  assertEq(result.winner, 1, 'Same winner as before');
})();

// ============================================================
// UPGRADE: +1 per win, P1 only — turns a losing hand into a win
// ============================================================
section('Upgrade: +1 per P1 win flips outcomes');

(() => {
  // Without upgrade: P1 plays 10 vs 11 → P2 wins
  // With +1 after first P1 win: P1 plays 10+1=11 vs 11 → tie (war or equal)
  // With +2: 10+2=12 > 11 → P1 wins

  // Setup: P1 wins first 2 hands to get +2, then faces an 11
  // P1: [14, 13, 10], P2: [2, 3, 11]
  // Turn 1: 14+0=14 vs 2 → P1 wins. Upgrade fires → p1Level=1
  // Turn 2: 13+1=14 vs 3 → P1 wins. Upgrade fires → p1Level=2
  // Turn 3: 10+2=12 vs 11 → P1 wins! (without upgrade, 10 < 11 → P2 would win)
  const upgrade = {
    trigger: ({ winner }) => ({ p1Upgrade: winner === 1, p2Upgrade: false }),
    effect: (level) => level,
  };
  const result = playWarGame({ p1Hand: [14, 13, 10], p2Hand: [2, 3, 11], upgrade });
  assertEq(result.p1UpgradeLevel, 3, 'P1 upgraded 3 times (won all 3 hands)');
  assertEq(result.winner, 1, 'P1 wins — upgrade turned 10 into effective 12 > 11');
  assertEq(result.p1HandWins, 3, 'P1 won all 3 hands');
  assertEq(result.turns, 3, 'Game ended in 3 turns');
})();

// ============================================================
// UPGRADE: Verify base card value is preserved (opponent wins base card)
// ============================================================
section('Upgrade: won cards retain base value');

(() => {
  // P1: [14, 3], P2: [2, 13]
  // Turn 1: 14+0=14 vs 2 → P1 wins. P1 deck: [3, 14, 2]. upgrade → level 1
  // Turn 2: 3+1=4 vs 13 → P2 wins. P2 gets base cards [13, 3] (not 4!)
  // Turn 3: P1 plays 14+1=15 vs 13 → P1 wins.
  // Turn 4: P1 plays 2+2=4 vs 3 → P1 wins. (P2 got base 3, not boosted 4)
  const upgrade = {
    trigger: ({ winner }) => ({ p1Upgrade: winner === 1, p2Upgrade: false }),
    effect: (level) => level,
  };
  const result = playWarGame({ p1Hand: [14, 3], p2Hand: [2, 13], upgrade, shufflePot: false });
  assertEq(result.winner, 1, 'P1 wins overall');
  // Key check: the game takes more than 2 turns because cards recycle at base value
  assert(result.turns > 2, 'Game lasts >2 turns — cards recycle at base value');
})();

// ============================================================
// UPGRADE: +1 per win breaks a war tie
// ============================================================
section('Upgrade: bonus breaks what would be a tie');

(() => {
  // Without upgrade: 7 vs 7 → war
  // With +1 (from a prior win): 7+1=8 vs 7 → P1 wins, no war
  // P1: [14, 7], P2: [2, 7]
  // Turn 1: 14+0 vs 2 → P1 wins. Level→1
  // Turn 2: 7+1=8 vs 7 → P1 wins (no war!)
  const upgrade = {
    trigger: ({ winner }) => ({ p1Upgrade: winner === 1, p2Upgrade: false }),
    effect: (level) => level,
  };
  const result = playWarGame({ p1Hand: [14, 7], p2Hand: [2, 7], upgrade });
  assertEq(result.wars, 0, 'No wars — upgrade broke the tie');
  assertEq(result.turns, 2, 'Game ends in 2 turns');
  assertEq(result.p1UpgradeLevel, 2, 'P1 at upgrade level 2');
})();

// ============================================================
// UPGRADE: Every N turns trigger
// ============================================================
section('Upgrade: every-N-turns trigger');

(() => {
  // Upgrade P1 every 2 turns. Use a quick game: P1 all high cards, ends in 3 turns.
  // Turn 1: no upgrade (odd). Turn 2: upgrade → level 1. Turn 3: no upgrade (odd).
  const upgrade = {
    trigger: ({ turns }) => ({ p1Upgrade: turns % 2 === 0, p2Upgrade: false }),
    effect: (level) => level,
  };
  const result = playWarGame({
    p1Hand: [14, 13, 12],
    p2Hand: [2, 3, 4],
    upgrade,
    shufflePot: false,
  });
  assertEq(result.turns, 3, 'Game ends in exactly 3 turns');
  assertEq(result.p1UpgradeLevel, 1, 'P1 upgraded once (turn 2 only)');
})();

// ============================================================
// UPGRADE: upgradeEffects.plusOne works correctly
// ============================================================
section('Upgrade: built-in plusOne effect');

(() => {
  assertEq(upgradeEffects.plusOne(0), 0, 'plusOne at level 0 = 0 bonus');
  assertEq(upgradeEffects.plusOne(1), 1, 'plusOne at level 1 = 1 bonus');
  assertEq(upgradeEffects.plusOne(5), 5, 'plusOne at level 5 = 5 bonus');
})();

// ============================================================
// UPGRADE: Card conservation still holds with upgrades
// ============================================================
section('Upgrade: card conservation with upgrades');

(() => {
  const upgrade = {
    trigger: ({ winner }) => ({ p1Upgrade: winner === 1, p2Upgrade: false }),
    effect: (level) => level,
  };
  for (let i = 0; i < 20; i++) {
    const result = playWarGame({ upgrade });
    assert(result.p1Remaining + result.p2Remaining === 52,
      `Game ${i + 1}: cards conserved (${result.p1Remaining} + ${result.p2Remaining} = 52)`);
  }
})();

// ============================================================
// UPGRADE: P1 with +1 per win dramatically increases win rate (statistical)
// ============================================================
section('Upgrade: statistical — +1/win heavily favors P1');

(() => {
  const upgrade = {
    trigger: ({ winner }) => ({ p1Upgrade: winner === 1, p2Upgrade: false }),
    effect: (level) => level,
  };
  let p1Wins = 0;
  const N = 200;
  const turnCounts = [];
  for (let i = 0; i < N; i++) {
    const r = playWarGame({ upgrade });
    if (r.winner === 1) p1Wins++;
    turnCounts.push(r.turns);
  }
  const winRate = p1Wins / N;
  const avgTurns = turnCounts.reduce((a, b) => a + b, 0) / N;
  console.log(`    (P1 win rate: ${(winRate * 100).toFixed(1)}%, avg turns: ${avgTurns.toFixed(1)})`);
  assert(winRate > 0.90, `P1 win rate > 90% with +1/win upgrade (got ${(winRate * 100).toFixed(1)}%)`);
  assert(avgTurns < 200, `Average turns < 200 with upgrade (got ${avgTurns.toFixed(1)})`);
})();

// ============================================================
// RESULTS
// ============================================================
console.log('\n══════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('══════════════════════════════════');
if (failures.length > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(`  ✗ ${f}`));
}
process.exit(failed > 0 ? 1 : 0);

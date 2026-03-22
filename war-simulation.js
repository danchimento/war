/**
 * War Card Game Engine — headless, UI-independent game logic.
 *
 * Works as both a Node.js module (for testing) and browser script (for UI).
 * When loaded in a browser via <script>, exposes window.WarSimulation.
 */
;(function (exports) {
  'use strict';

  // ===== CONSTANTS =====

  var SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
  var RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  var RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  var SUIT_SYMBOLS = {
    hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660'
  };

  // ===== BASIC FUNCTIONS =====

  /** Create a 52-card deck as plain integers (2–14, four of each). */
  function createDeck() {
    var deck = [];
    for (var rank = 2; rank <= 14; rank++) {
      for (var i = 0; i < 4; i++) deck.push(rank);
    }
    return deck;
  }

  /** Create a 52-card deck as objects { suit, rank, value, baseValue }. */
  function createFullDeck() {
    var deck = [];
    for (var s = 0; s < SUITS.length; s++) {
      for (var r = 0; r < RANKS.length; r++) {
        var v = RANK_VALUES[RANKS[r]];
        deck.push({ suit: SUITS[s], rank: RANKS[r], value: v, baseValue: v });
      }
    }
    return deck;
  }

  /** Fisher-Yates in-place shuffle. Returns the array for chaining. */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  /** Return the numeric value of a card (works for both integers and objects). */
  function cardValue(card) {
    if (typeof card === 'number') return card;
    return card.value;
  }

  // ===== STAT HELPERS =====

  function percentile(arr, p) {
    var sorted = arr.slice().sort(function (a, b) { return a - b; });
    var idx = (p / 100) * (sorted.length - 1);
    var lower = Math.floor(idx);
    var upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
  }

  function stddev(arr, mean) {
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += (arr[i] - mean) * (arr[i] - mean);
    return Math.sqrt(sum / arr.length);
  }

  // ===== UPGRADE CATALOG (rarity-based) =====

  var RARITY_WEIGHTS = { common: 70, rare: 20, epic: 10 };

  function rollRarity() {
    var roll = Math.random() * 100;
    if (roll < RARITY_WEIGHTS.epic) return 'epic';
    if (roll < RARITY_WEIGHTS.epic + RARITY_WEIGHTS.rare) return 'rare';
    return 'common';
  }

  var UPGRADE_CATALOG = [
    // Common
    { key: 'boost3',    name: '+3 Value',      desc: '+3 to your next card',                       rarity: 'common', icon: '\u2B06' },
    { key: 'boost5',    name: '+5 Value',      desc: '+5 to your next card',                       rarity: 'common', icon: '\u23EB' },
    { key: 'xpUp',      name: 'XP Up',         desc: 'Permanently gain +5 XP per win',             rarity: 'common', icon: '\u2B50' },
    { key: 'comboXpUp', name: 'Combo XP Up',   desc: 'Permanently increase combo XP bonus by +5%', rarity: 'common', icon: '\uD83D\uDD25' },
    // Rare
    { key: 'stealCard', name: 'Steal Card',    desc: 'Steal a random card from the opponent',      rarity: 'rare',   icon: '\uD83E\uDD1A' },
    { key: 'critXpUp',  name: 'Crit XP Up',    desc: 'Permanently increase War XP bonus by +25%',  rarity: 'rare',   icon: '\u26A1' },
  ];

  // Generate per-rank permanent upgrade cards (all common)
  for (var ri = 0; ri < RANKS.length; ri++) {
    (function (rank, val) {
      UPGRADE_CATALOG.push({
        key: 'permBoost_' + rank,
        name: 'Empower ' + rank,
        desc: 'Permanently improve the value of all ' + rank + 's by 1',
        rarity: 'common',
        icon: '\uD83D\uDC8E',
        targetRank: rank,
      });
    })(RANKS[ri], RANK_VALUES[RANKS[ri]]);
  }

  // Epic
  UPGRADE_CATALOG.push(
    { key: 'autoWinWar',  name: 'Auto-Win War',  desc: 'Automatically win the next war',           rarity: 'epic',   icon: '\uD83D\uDC51' },
    { key: 'moreChoices', name: 'More Choices',   desc: 'Permanently get +1 upgrade choice',       rarity: 'epic',   icon: '\uD83C\uDFB0' }
  );

  // ===== HEADLESS SIMULATION =====

  function collectPot(pot, winner, shouldShuffle) {
    if (shouldShuffle) {
      var cards = [];
      for (var i = 0; i < pot.length; i++) cards.push(pot[i].card);
      shuffle(cards);
      return cards;
    }
    var winnerCards = [];
    var loserCards = [];
    for (var i = 0; i < pot.length; i++) {
      if (pot[i].owner === winner) winnerCards.push(pot[i].card);
      else loserCards.push(pot[i].card);
    }
    return winnerCards.concat(loserCards);
  }

  /**
   * Play a complete War game headlessly and return rich statistics.
   *
   * Options:
   *   p1Hand, p2Hand — custom starting hands (arrays of integers 2–14)
   *   shufflePot     — shuffle won cards before adding to deck (default true)
   *   maxTurns       — turn cap (default 10000)
   *   upgrade        — { trigger(ctx) → {p1Upgrade, p2Upgrade}, effect(level) → bonus }
   */
  function playWarGame(options) {
    options = options || {};
    var p1Hand, p2Hand;

    if (options.p1Hand && options.p2Hand) {
      p1Hand = options.p1Hand.slice();
      p2Hand = options.p2Hand.slice();
    } else {
      var deck = createDeck();
      shuffle(deck);
      var half = deck.length / 2;
      p1Hand = deck.slice(0, half);
      p2Hand = deck.slice(half);
    }

    var shufflePot = options.shufflePot !== undefined ? options.shufflePot : true;
    var maxTurns = options.maxTurns || 10000;
    var turns = 0, wars = 0, doubleWars = 0, tripleWars = 0;
    var p1HandWins = 0, p2HandWins = 0;
    var warEndedGame = false;
    var p1MaxStreak = 0, p2MaxStreak = 0, p1CurStreak = 0, p2CurStreak = 0;
    var p1MaxLead = 0, p2MaxLead = 0, leadChanges = 0, lastLeader = 0;

    while (p1Hand.length > 0 && p2Hand.length > 0 && turns < maxTurns) {
      turns++;

      var p1Card = p1Hand.shift();
      var p2Card = p2Hand.shift();
      var pot = [{ card: p1Card, owner: 1 }, { card: p2Card, owner: 2 }];

      var result = p1Card > p2Card ? 1 : p2Card > p1Card ? 2 : 0;
      var warCount = 0;

      while (result === 0) {
        wars++;
        warCount++;
        if (warCount === 2) doubleWars++;
        if (warCount === 3) tripleWars++;

        // Check if both players can afford war (need 4 cards: 3 face-down + 1 reveal)
        if (p1Hand.length < 4 || p2Hand.length < 4) {
          warEndedGame = true;
          var loser, winner;
          if (p1Hand.length <= p2Hand.length) {
            loser = p1Hand; winner = p2Hand; result = 2;
          } else {
            loser = p2Hand; winner = p1Hand; result = 1;
          }
          for (var i = 0; i < pot.length; i++) winner.push(pot[i].card);
          while (loser.length > 0) winner.push(loser.shift());
          break;
        }

        // Deal 3 face-down + 1 reveal per side
        for (var i = 0; i < 3; i++) {
          pot.push({ card: p1Hand.shift(), owner: 1 });
          pot.push({ card: p2Hand.shift(), owner: 2 });
        }
        var p1Reveal = p1Hand.shift();
        var p2Reveal = p2Hand.shift();
        pot.push({ card: p1Reveal, owner: 1 });
        pot.push({ card: p2Reveal, owner: 2 });

        result = p1Reveal > p2Reveal ? 1 : p2Reveal > p1Reveal ? 2 : 0;
      }

      // Collect pot to winner (unless war ended the game — cards already moved)
      if (!warEndedGame) {
        var won = collectPot(pot, result, shufflePot);
        if (result === 1) {
          p1HandWins++;
          for (var i = 0; i < won.length; i++) p1Hand.push(won[i]);
          p1CurStreak++; p2CurStreak = 0;
          if (p1CurStreak > p1MaxStreak) p1MaxStreak = p1CurStreak;
        } else {
          p2HandWins++;
          for (var i = 0; i < won.length; i++) p2Hand.push(won[i]);
          p2CurStreak++; p1CurStreak = 0;
          if (p2CurStreak > p2MaxStreak) p2MaxStreak = p2CurStreak;
        }
      }

      // Lead tracking
      var diff = p1Hand.length - p2Hand.length;
      if (diff > p1MaxLead) p1MaxLead = diff;
      if (-diff > p2MaxLead) p2MaxLead = -diff;
      var leader = diff > 0 ? 1 : diff < 0 ? 2 : 0;
      if (leader !== 0 && lastLeader !== 0 && leader !== lastLeader) leadChanges++;
      if (leader !== 0) lastLeader = leader;

    }

    return {
      winner: p1Hand.length > p2Hand.length ? 1 : 2,
      turns: turns,
      wars: wars,
      doubleWars: doubleWars,
      tripleWars: tripleWars,
      p1Remaining: p1Hand.length,
      p2Remaining: p2Hand.length,
      p1HandWins: p1HandWins,
      p2HandWins: p2HandWins,
      warEndedGame: warEndedGame,
      capped: turns >= maxTurns,
      p1MaxStreak: p1MaxStreak,
      p2MaxStreak: p2MaxStreak,
      p1MaxLead: p1MaxLead,
      p2MaxLead: p2MaxLead,
      leadChanges: leadChanges,
    };
  }

  // ===== INTERACTIVE GAME ENGINE =====

  /**
   * Step-by-step game engine for UI-driven play.
   * Cards are objects { suit, rank, value }.
   * The UI calls methods in sequence and handles rendering/animation.
   */
  function WarGameEngine() {
    this.p1Hand = [];
    this.p2Hand = [];
    this.pot = [];

    // XP system
    this.xp = 0;
    this.xpPerWin = 20;
    this.xpToLevel = 100;
    this.criticalXpPercent = 150;
    this.comboXpPercent = 10;
    this.combo = 0;

    // Upgrade system
    this.numUpgradeChoices = 3;
    this.nextCardBoost = 0;
    this.autoWinWar = false;
  }

  WarGameEngine.prototype.setup = function () {
    var deck = createFullDeck();
    shuffle(deck);
    this.p1Hand = deck.slice(0, 26);
    this.p2Hand = deck.slice(26);
    this.pot = [];

    this.xp = 0;
    this.xpPerWin = 20;
    this.criticalXpPercent = 150;
    this.comboXpPercent = 10;
    this.combo = 0;

    this.numUpgradeChoices = 3;
    this.nextCardBoost = 0;
    this.autoWinWar = false;
  };

  WarGameEngine.prototype.getP1Count = function () { return this.p1Hand.length; };
  WarGameEngine.prototype.getP2Count = function () { return this.p2Hand.length; };

  /** Reset pot for a new turn. */
  WarGameEngine.prototype.beginTurn = function () {
    this.pot = [];
  };

  /** Draw from player's (P1) deck, add to pot. Returns card object or null. */
  WarGameEngine.prototype.drawPlayer = function () {
    if (this.p1Hand.length === 0) return null;
    var card = this.p1Hand.shift();
    this.pot.push({ card: card, owner: 'player' });
    return card;
  };

  /** Draw from opponent's (P2) deck, add to pot. Returns card object or null. */
  WarGameEngine.prototype.drawOpponent = function () {
    if (this.p2Hand.length === 0) return null;
    var card = this.p2Hand.shift();
    this.pot.push({ card: card, owner: 'opponent' });
    return card;
  };

  // --- XP helpers ---

  /** Calculate XP for a win. isWar = true applies critical multiplier. */
  WarGameEngine.prototype.calcXP = function (isWar) {
    var base = this.xpPerWin;
    var comboMultiplier = 1 + (this.combo * this.comboXpPercent / 100);
    var xp = base * comboMultiplier;
    if (isWar) {
      xp = xp * (this.criticalXpPercent / 100);
    }
    return Math.floor(xp);
  };

  /**
   * Compare two cards with temporary boost applied.
   * Returns { winner: 'player'|'opponent'|'tie', playerEffective, opponentEffective, boosted }
   */
  WarGameEngine.prototype.evaluate = function (playerCard, opponentCard) {
    var pv = playerCard.value;
    var ov = opponentCard.value;
    var boosted = false;

    if (this.nextCardBoost > 0) {
      pv += this.nextCardBoost;
      this.nextCardBoost = 0;
      boosted = true;
    }

    var winner;
    if (pv > ov) {
      winner = 'player';
    } else if (ov > pv) {
      winner = 'opponent';
    } else {
      winner = 'tie';
    }

    return { winner: winner, playerEffective: pv, opponentEffective: ov, boosted: boosted };
  };

  /** Can both sides afford a war? (need 4 cards each: 3 face-down + 1 reveal) */
  WarGameEngine.prototype.canAffordWar = function () {
    return this.p1Hand.length >= 4 && this.p2Hand.length >= 4;
  };

  /** Determine who loses when war can't be afforded. Returns 'player' or 'opponent'. */
  WarGameEngine.prototype.warLoser = function () {
    if (this.p1Hand.length < 4 && this.p2Hand.length < 4) {
      return this.p1Hand.length <= this.p2Hand.length ? 'player' : 'opponent';
    }
    if (this.p1Hand.length < 4) return 'player';
    if (this.p2Hand.length < 4) return 'opponent';
    return null;
  };

  /**
   * Deal war cards: 3 face-down + 1 reveal per side. Adds all to pot.
   * Returns { p1FaceDown: card[], p2FaceDown: card[], p1Reveal: card, p2Reveal: card }
   */
  WarGameEngine.prototype.dealWarCards = function () {
    var p1FaceDown = [];
    var p2FaceDown = [];

    for (var i = 0; i < 3; i++) {
      var c1 = this.p1Hand.shift();
      this.pot.push({ card: c1, owner: 'player' });
      p1FaceDown.push(c1);

      var c2 = this.p2Hand.shift();
      this.pot.push({ card: c2, owner: 'opponent' });
      p2FaceDown.push(c2);
    }

    var p1Reveal = this.p1Hand.shift();
    this.pot.push({ card: p1Reveal, owner: 'player' });

    var p2Reveal = this.p2Hand.shift();
    this.pot.push({ card: p2Reveal, owner: 'opponent' });

    return { p1FaceDown: p1FaceDown, p2FaceDown: p2FaceDown, p1Reveal: p1Reveal, p2Reveal: p2Reveal };
  };

  /**
   * Force war loss: all pot + loser's hand go to the winner.
   * Returns the winner ('player' or 'opponent').
   */
  WarGameEngine.prototype.forceWarLoss = function () {
    var loserSide = this.warLoser();
    var loserHand, winnerHand;

    if (loserSide === 'player') {
      loserHand = this.p1Hand;
      winnerHand = this.p2Hand;
    } else {
      loserHand = this.p2Hand;
      winnerHand = this.p1Hand;
    }

    for (var i = 0; i < this.pot.length; i++) winnerHand.push(this.pot[i].card);
    while (loserHand.length > 0) winnerHand.push(loserHand.shift());
    this.pot = [];

    return loserSide === 'player' ? 'opponent' : 'player';
  };

  /** Move all pot cards to the winner's deck (shuffled to prevent patterns). */
  WarGameEngine.prototype.collectToWinner = function (winner) {
    var cards = [];
    for (var i = 0; i < this.pot.length; i++) cards.push(this.pot[i].card);
    shuffle(cards);

    var dest = winner === 'player' ? this.p1Hand : this.p2Hand;
    for (var i = 0; i < cards.length; i++) dest.push(cards[i]);
    this.pot = [];
  };

  // --- XP & Upgrade management ---

  /** Add XP. Returns true if leveled up (XP resets). */
  WarGameEngine.prototype.addXP = function (amount) {
    this.xp += amount;
    if (this.xp >= this.xpToLevel) {
      this.xp = 0;
      return true;
    }
    return false;
  };

  WarGameEngine.prototype.getXPProgress = function () {
    return { current: this.xp, needed: this.xpToLevel, percentage: (this.xp / this.xpToLevel) * 100 };
  };

  /** Get upgrade choices, each independently rolling for rarity. */
  WarGameEngine.prototype.getUpgradeChoices = function () {
    var n = this.numUpgradeChoices;
    var choices = [];
    var usedKeys = {};

    for (var i = 0; i < n; i++) {
      var rarity = rollRarity();
      var pool = [];
      for (var j = 0; j < UPGRADE_CATALOG.length; j++) {
        if (UPGRADE_CATALOG[j].rarity === rarity && !usedKeys[UPGRADE_CATALOG[j].key]) pool.push(UPGRADE_CATALOG[j]);
      }
      // Fallback to any rarity if pool is empty
      if (pool.length === 0) {
        for (var j = 0; j < UPGRADE_CATALOG.length; j++) {
          if (!usedKeys[UPGRADE_CATALOG[j].key]) pool.push(UPGRADE_CATALOG[j]);
        }
      }
      if (pool.length === 0) break;
      var pick = pool[Math.floor(Math.random() * pool.length)];
      usedKeys[pick.key] = true;
      choices.push({ key: pick.key, name: pick.name, desc: pick.desc, rarity: pick.rarity, icon: pick.icon });
    }
    return choices;
  };

  /**
   * Activate an upgrade by key. Returns result info for UI feedback.
   * Immediate effects are applied now; temp effects set flags for next round.
   */
  WarGameEngine.prototype.activateUpgrade = function (key) {
    var def = null;
    for (var i = 0; i < UPGRADE_CATALOG.length; i++) {
      if (UPGRADE_CATALOG[i].key === key) { def = UPGRADE_CATALOG[i]; break; }
    }
    if (!def) return null;

    var result = { key: key, name: def.name, rarity: def.rarity, icon: def.icon };

    switch (key) {
      case 'boost3':
        this.nextCardBoost += 3;
        break;
      case 'boost5':
        this.nextCardBoost += 5;
        break;
      case 'xpUp':
        this.xpPerWin += 5;
        result.detail = 'XP per win: ' + this.xpPerWin;
        break;
      case 'comboXpUp':
        this.comboXpPercent += 5;
        result.detail = 'Combo XP: +' + this.comboXpPercent + '%';
        break;
      case 'stealCard':
        if (this.p2Hand.length > 0) {
          var idx = Math.floor(Math.random() * this.p2Hand.length);
          var stolen = this.p2Hand.splice(idx, 1)[0];
          this.p1Hand.push(stolen);
          result.stolenCard = stolen;
          result.detail = 'Stole ' + stolen.rank + ' of ' + stolen.suit;
        }
        break;
      case 'critXpUp':
        this.criticalXpPercent += 25;
        result.detail = 'War XP: ' + this.criticalXpPercent + '%';
        break;
      default:
        // Handle per-rank permanent boosts (permBoost_2 .. permBoost_A)
        if (key.indexOf('permBoost_') === 0) {
          var targetRank = key.substring('permBoost_'.length);
          var boostedCards = [];
          for (var bi = 0; bi < this.p1Hand.length; bi++) {
            if (this.p1Hand[bi].rank === targetRank) {
              this.p1Hand[bi].value += 1;
              boostedCards.push(this.p1Hand[bi]);
            }
          }
          result.boostedCards = boostedCards;
          result.targetRank = targetRank;
          result.detail = 'All ' + targetRank + 's permanently +1';
        }
        break;
      case 'autoWinWar':
        this.autoWinWar = true;
        break;
      case 'moreChoices':
        this.numUpgradeChoices += 1;
        result.detail = 'Choices: ' + this.numUpgradeChoices;
        break;
    }

    return result;
  };

  /** Check game over. Returns { over, winner } where winner is 'player' or 'opponent' or null. */
  WarGameEngine.prototype.isGameOver = function () {
    if (this.p1Hand.length === 0) return { over: true, winner: 'opponent' };
    if (this.p2Hand.length === 0) return { over: true, winner: 'player' };
    return { over: false, winner: null };
  };

  // ===== EXPORTS =====

  exports.SUITS = SUITS;
  exports.RANKS = RANKS;
  exports.RANK_VALUES = RANK_VALUES;
  exports.SUIT_SYMBOLS = SUIT_SYMBOLS;
  exports.createDeck = createDeck;
  exports.createFullDeck = createFullDeck;
  exports.shuffle = shuffle;
  exports.cardValue = cardValue;
  exports.percentile = percentile;
  exports.stddev = stddev;
  exports.RARITY_WEIGHTS = RARITY_WEIGHTS;
  exports.rollRarity = rollRarity;
  exports.UPGRADE_CATALOG = UPGRADE_CATALOG;
  exports.playWarGame = playWarGame;
  exports.WarGameEngine = WarGameEngine;

})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : (typeof window !== 'undefined' ? (window.WarSimulation = {}) : (this.WarSimulation = {})));

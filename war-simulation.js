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

  /** Create a 52-card deck as objects { suit, rank, value }. */
  function createFullDeck() {
    var deck = [];
    for (var s = 0; s < SUITS.length; s++) {
      for (var r = 0; r < RANKS.length; r++) {
        deck.push({ suit: SUITS[s], rank: RANKS[r], value: RANK_VALUES[RANKS[r]] });
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

  // ===== UPGRADE HELPERS (headless simulation) =====

  var upgradeEffects = {
    plusOne: function (level) { return level; },
  };

  var upgradeTriggers = {
    onWin: function (ctx) { return { p1Upgrade: ctx.winner === 1, p2Upgrade: ctx.winner === 2 }; },
    everyNTurns: function (n) {
      return function (ctx) { return { p1Upgrade: ctx.turns % n === 0, p2Upgrade: false }; };
    },
  };

  var UPGRADE_CATALOG = {
    plusOneOnWin: {
      trigger: upgradeTriggers.onWin,
      effect: upgradeEffects.plusOne,
    },
  };

  function applyUpgrade(baseValue, level, effect) {
    if (!effect || level === 0) return baseValue;
    return baseValue + effect(level);
  }

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
    var upgrade = options.upgrade || null;

    var turns = 0, wars = 0, doubleWars = 0, tripleWars = 0;
    var p1HandWins = 0, p2HandWins = 0;
    var warEndedGame = false;
    var p1MaxStreak = 0, p2MaxStreak = 0, p1CurStreak = 0, p2CurStreak = 0;
    var p1MaxLead = 0, p2MaxLead = 0, leadChanges = 0, lastLeader = 0;
    var p1UpgradeLevel = 0, p2UpgradeLevel = 0, p1TotalUpgrades = 0;

    while (p1Hand.length > 0 && p2Hand.length > 0 && turns < maxTurns) {
      turns++;

      var p1Card = p1Hand.shift();
      var p2Card = p2Hand.shift();
      var pot = [{ card: p1Card, owner: 1 }, { card: p2Card, owner: 2 }];

      var p1Eff = upgrade ? applyUpgrade(p1Card, p1UpgradeLevel, upgrade.effect) : p1Card;
      var p2Eff = upgrade ? applyUpgrade(p2Card, p2UpgradeLevel, upgrade.effect) : p2Card;

      var result = p1Eff > p2Eff ? 1 : p2Eff > p1Eff ? 2 : 0;
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

        var p1RevEff = upgrade ? applyUpgrade(p1Reveal, p1UpgradeLevel, upgrade.effect) : p1Reveal;
        var p2RevEff = upgrade ? applyUpgrade(p2Reveal, p2UpgradeLevel, upgrade.effect) : p2Reveal;
        result = p1RevEff > p2RevEff ? 1 : p2RevEff > p1RevEff ? 2 : 0;
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

      // Upgrade trigger
      if (upgrade && upgrade.trigger && !warEndedGame) {
        var t = upgrade.trigger({ winner: result, turns: turns });
        if (t.p1Upgrade) { p1UpgradeLevel++; p1TotalUpgrades++; }
        if (t.p2Upgrade) { p2UpgradeLevel++; }
      }
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
      p1UpgradeLevel: p1UpgradeLevel,
      p2UpgradeLevel: p2UpgradeLevel,
      p1TotalUpgrades: p1TotalUpgrades,
    };
  }

  // ===== NAMED UPGRADES (for interactive / UI-driven games) =====

  var NAMED_UPGRADES = {
    boost:      { name: '+2 Boost',     desc: 'Add +2 to your card value',                  duration: 3, durationType: 'rounds', icon: '\u2B06' },
    sabotage:   { name: '-2 Sabotage',  desc: "Subtract 2 from opponent's card value",       duration: 3, durationType: 'rounds', icon: '\u2B07' },
    doubleDown: { name: 'Double Down',  desc: 'Next war win, take 2 extra opponent cards',   duration: 1, durationType: 'war',    icon: '\u2694' },
    shield:     { name: 'Shield',       desc: 'Next round you lose, keep your card',         duration: 1, durationType: 'use',    icon: '\uD83D\uDEE1' },
    aceCrusher: { name: 'Ace Crusher',  desc: 'Your card beats Aces regardless',             duration: 2, durationType: 'rounds', icon: '\uD83D\uDC80' },
    rally:      { name: 'Rally',        desc: 'If behind (fewer cards), +3 to your value',   duration: 3, durationType: 'rounds', icon: '\uD83D\uDCE3' },
  };

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
    this.activeUpgrades = [];
    this.xp = 0;
    this.xpPerWin = 20;
    this.xpToLevel = 100;
  }

  WarGameEngine.prototype.setup = function () {
    var deck = createFullDeck();
    shuffle(deck);
    this.p1Hand = deck.slice(0, 26);
    this.p2Hand = deck.slice(26);
    this.pot = [];
    this.activeUpgrades = [];
    this.xp = 0;
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

  /**
   * Compare two cards with active upgrade modifiers applied.
   * Returns { winner: 'player'|'opponent'|'tie', playerEffective, opponentEffective }
   */
  WarGameEngine.prototype.evaluate = function (playerCard, opponentCard) {
    var pv = playerCard.value;
    var ov = opponentCard.value;
    var aceCrusherActive = false;
    var playerBehind = this.p1Hand.length < this.p2Hand.length;

    for (var i = 0; i < this.activeUpgrades.length; i++) {
      var u = this.activeUpgrades[i];
      switch (u.key) {
        case 'boost': pv += 2; break;
        case 'sabotage': ov -= 2; break;
        case 'aceCrusher':
          if (opponentCard.value === 14) aceCrusherActive = true;
          break;
        case 'rally':
          if (playerBehind) pv += 3;
          break;
      }
    }

    var winner;
    if (aceCrusherActive && opponentCard.value === 14) {
      winner = 'player';
    } else if (pv > ov) {
      winner = 'player';
    } else if (ov > pv) {
      winner = 'opponent';
    } else {
      winner = 'tie';
    }

    return { winner: winner, playerEffective: pv, opponentEffective: ov };
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

  /** Shield: each side gets their own cards back from the pot. */
  WarGameEngine.prototype.collectShielded = function () {
    for (var i = 0; i < this.pot.length; i++) {
      var entry = this.pot[i];
      if (entry.owner === 'player') this.p1Hand.push(entry.card);
      else this.p2Hand.push(entry.card);
    }
    this.pot = [];
  };

  // --- XP & Upgrade management ---

  /** Add XP. Returns true if leveled up (XP resets). */
  WarGameEngine.prototype.addXP = function (amount) {
    this.xp += amount;
    if (this.xp >= this.xpToLevel) {
      this.xp -= this.xpToLevel;
      return true;
    }
    return false;
  };

  WarGameEngine.prototype.getXPProgress = function () {
    return { current: this.xp, needed: this.xpToLevel, percentage: (this.xp / this.xpToLevel) * 100 };
  };

  /** Get n random upgrade choices from the catalog. */
  WarGameEngine.prototype.getUpgradeChoices = function (n) {
    n = n || 3;
    var keys = shuffle(Object.keys(NAMED_UPGRADES).slice());
    var choices = [];
    for (var i = 0; i < Math.min(n, keys.length); i++) {
      var k = keys[i];
      var def = NAMED_UPGRADES[k];
      choices.push({ key: k, name: def.name, desc: def.desc, duration: def.duration, durationType: def.durationType, icon: def.icon });
    }
    return choices;
  };

  /** Activate a named upgrade. */
  WarGameEngine.prototype.activateUpgrade = function (key) {
    var def = NAMED_UPGRADES[key];
    if (!def) return;
    this.activeUpgrades.push({ key: key, name: def.name, desc: def.desc, duration: def.duration, durationType: def.durationType, icon: def.icon, remaining: def.duration });
  };

  /** Tick round-based upgrades (call after each round resolves). */
  WarGameEngine.prototype.tickUpgrades = function () {
    var kept = [];
    for (var i = 0; i < this.activeUpgrades.length; i++) {
      var u = this.activeUpgrades[i];
      if (u.durationType === 'rounds') {
        u.remaining--;
        if (u.remaining > 0) kept.push(u);
      } else {
        kept.push(u);
      }
    }
    this.activeUpgrades = kept;
  };

  /** Consume shield if active. Returns true if consumed. */
  WarGameEngine.prototype.consumeShield = function () {
    for (var i = 0; i < this.activeUpgrades.length; i++) {
      if (this.activeUpgrades[i].key === 'shield') {
        this.activeUpgrades.splice(i, 1);
        return true;
      }
    }
    return false;
  };

  /** Consume double-down if active. Returns true if consumed. */
  WarGameEngine.prototype.consumeDoubleDown = function () {
    for (var i = 0; i < this.activeUpgrades.length; i++) {
      if (this.activeUpgrades[i].key === 'doubleDown') {
        this.activeUpgrades.splice(i, 1);
        return true;
      }
    }
    return false;
  };

  /** Check if an upgrade is currently active. */
  WarGameEngine.prototype.hasUpgrade = function (key) {
    for (var i = 0; i < this.activeUpgrades.length; i++) {
      if (this.activeUpgrades[i].key === key) return true;
    }
    return false;
  };

  /** Steal 2 extra cards from opponent (for double-down). Returns stolen cards. */
  WarGameEngine.prototype.applyDoubleDownSteal = function () {
    var stolen = [];
    for (var i = 0; i < 2 && this.p2Hand.length > 0; i++) {
      stolen.push(this.p2Hand.shift());
    }
    for (var i = 0; i < stolen.length; i++) this.p1Hand.push(stolen[i]);
    return stolen;
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
  exports.upgradeEffects = upgradeEffects;
  exports.upgradeTriggers = upgradeTriggers;
  exports.UPGRADE_CATALOG = UPGRADE_CATALOG;
  exports.applyUpgrade = applyUpgrade;
  exports.playWarGame = playWarGame;
  exports.NAMED_UPGRADES = NAMED_UPGRADES;
  exports.WarGameEngine = WarGameEngine;

})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : (typeof window !== 'undefined' ? (window.WarSimulation = {}) : (this.WarSimulation = {})));

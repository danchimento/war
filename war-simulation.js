/**
 * War Card Game Engine — headless, UI-independent game logic.
 *
 * Works as both a Node.js module (for testing) and browser script (for UI).
 * When loaded in a browser via <script>, exposes window.WarSimulation.
 */
;(function (exports) {
  'use strict';

  // ===== DECK DEFINITIONS =====

  var SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
  var SUIT_SYMBOLS = {
    hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660', none: '\u2605'
  };

  var DECKS = {
    standard: {
      id: 'standard',
      name: 'Standard',
      suits: SUITS,
      ranks: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
      rankValues: {
        '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
        '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
      },
      rankDisplay: null,
      centerSymbol: 'suit',
      rankSymbols: null,
      specialCards: null,
    },
    chess: {
      id: 'chess',
      name: 'Chess',
      suits: SUITS,
      ranks: ['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King', 'Wizard'],
      rankValues: { Pawn: 1, Knight: 2, Bishop: 3, Rook: 4, Queen: 5, King: 6, Wizard: 7 },
      rankDisplay: { Pawn: 'P', Knight: 'N', Bishop: 'B', Rook: 'R', Queen: 'Q', King: 'K', Wizard: 'W' },
      centerSymbol: 'rank',
      rankSymbols: {
        Pawn: '\u265F', Knight: '\u265E', Bishop: '\u265D',
        Rook: '\u265C', Queen: '\u265B', King: '\u265A', Wizard: '\u2605'
      },
      specialCards: { Wizard: { count: 2, suit: 'none' } },
    },
  };

  // ===== BASIC FUNCTIONS =====

  function createDeckCards(deckDef) {
    var deck = [];
    for (var r = 0; r < deckDef.ranks.length; r++) {
      var rank = deckDef.ranks[r];
      var val = deckDef.rankValues[rank];
      var special = deckDef.specialCards && deckDef.specialCards[rank];
      if (special) {
        for (var i = 0; i < special.count; i++) {
          deck.push({ suit: special.suit || 'none', rank: rank, value: val, baseValue: val });
        }
      } else {
        for (var s = 0; s < deckDef.suits.length; s++) {
          deck.push({ suit: deckDef.suits[s], rank: rank, value: val, baseValue: val });
        }
      }
    }
    return deck;
  }

  /** Create a 52-card standard deck as plain integers (for headless sim). */
  function createDeck() {
    var deck = [];
    for (var rank = 2; rank <= 14; rank++) {
      for (var i = 0; i < 4; i++) deck.push(rank);
    }
    return deck;
  }

  /** Create standard full deck (backwards compat). */
  function createFullDeck() {
    return createDeckCards(DECKS.standard);
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

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

  // ===== UPGRADE CATALOG =====

  var RARITY_WEIGHTS = { common: 70, rare: 20, epic: 10 };

  function rollRarity() {
    var roll = Math.random() * 100;
    if (roll < RARITY_WEIGHTS.epic) return 'epic';
    if (roll < RARITY_WEIGHTS.epic + RARITY_WEIGHTS.rare) return 'rare';
    return 'common';
  }

  /** Base upgrades that are deck-independent. */
  var BASE_UPGRADES = [
    { key: 'boost3',    name: '+3 Value',      desc: '+3 to your next card',                       rarity: 'common', icon: '\u2B06' },
    { key: 'boost5',    name: '+5 Value',      desc: '+5 to your next card',                       rarity: 'common', icon: '\u23EB' },
    { key: 'boost7',    name: '+7 Value',      desc: '+7 to your next card',                       rarity: 'common', icon: '\u23EB' },
    { key: 'boost10',   name: '+10 Value',     desc: '+10 to your next card',                      rarity: 'common', icon: '\u23EB' },
    { key: 'xpUp',      name: 'XP Up',         desc: 'Permanently gain +5 XP per win',             rarity: 'common', icon: '\u2B50' },
    { key: 'comboXpUp', name: 'Combo XP Up',   desc: 'Permanently increase combo XP bonus by +5%', rarity: 'common', icon: '\uD83D\uDD25' },
    { key: 'stealCard', name: 'Steal Card',    desc: 'Steal a random card from the opponent',      rarity: 'rare',   icon: '\uD83E\uDD1A' },
    { key: 'critXpUp',  name: 'Crit XP Up',    desc: 'Permanently increase War XP bonus by +25%',  rarity: 'rare',   icon: '\u26A1' },
    { key: 'autoWinWar',  name: 'Auto-Win War',  desc: 'Automatically win the next war',             rarity: 'epic',   icon: '\uD83D\uDC51' },
    { key: 'moreChoices', name: 'More Choices',   desc: 'Permanently get +1 upgrade choice',         rarity: 'epic',   icon: '\uD83C\uDFB0' },
    { key: 'lossXpUp',    name: 'Consolation XP', desc: 'Gain 10% of base XP when losing a battle', rarity: 'epic',   icon: '\uD83D\uDEE1' },
  ];

  /** Build the full upgrade catalog for a given deck definition. */
  function buildUpgradeCatalog(deckDef) {
    var catalog = BASE_UPGRADES.slice();
    var displayName = function (rank) {
      return (deckDef.rankDisplay && deckDef.rankDisplay[rank]) || rank;
    };
    for (var r = 0; r < deckDef.ranks.length; r++) {
      var rank = deckDef.ranks[r];
      var dn = displayName(rank);
      catalog.push({
        key: 'permBoost_' + rank,
        name: 'Empower ' + dn,
        desc: 'Permanently improve the value of all ' + rank + 's by 1',
        rarity: 'common',
        icon: '\uD83D\uDC8E',
        targetRank: rank,
      });
      catalog.push({
        key: 'permBoost2_' + rank,
        name: 'Supercharge ' + dn,
        desc: 'Permanently improve the value of all ' + rank + 's by 2',
        rarity: 'rare',
        icon: '\uD83D\uDC8E',
        targetRank: rank,
      });
    }
    return catalog;
  }

  // Keep a mutable reference for backwards compat (updated on setup)
  var UPGRADE_CATALOG = buildUpgradeCatalog(DECKS.standard);

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
        wars++; warCount++;
        if (warCount === 2) doubleWars++;
        if (warCount === 3) tripleWars++;
        if (p1Hand.length < 4 || p2Hand.length < 4) {
          warEndedGame = true;
          var loser, winner;
          if (p1Hand.length <= p2Hand.length) { loser = p1Hand; winner = p2Hand; result = 2; }
          else { loser = p2Hand; winner = p1Hand; result = 1; }
          for (var i = 0; i < pot.length; i++) winner.push(pot[i].card);
          while (loser.length > 0) winner.push(loser.shift());
          break;
        }
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

      var diff = p1Hand.length - p2Hand.length;
      if (diff > p1MaxLead) p1MaxLead = diff;
      if (-diff > p2MaxLead) p2MaxLead = -diff;
      var leader = diff > 0 ? 1 : diff < 0 ? 2 : 0;
      if (leader !== 0 && lastLeader !== 0 && leader !== lastLeader) leadChanges++;
      if (leader !== 0) lastLeader = leader;
    }

    return {
      winner: p1Hand.length > p2Hand.length ? 1 : 2,
      turns: turns, wars: wars, doubleWars: doubleWars, tripleWars: tripleWars,
      p1Remaining: p1Hand.length, p2Remaining: p2Hand.length,
      p1HandWins: p1HandWins, p2HandWins: p2HandWins,
      warEndedGame: warEndedGame, capped: turns >= maxTurns,
      p1MaxStreak: p1MaxStreak, p2MaxStreak: p2MaxStreak,
      p1MaxLead: p1MaxLead, p2MaxLead: p2MaxLead, leadChanges: leadChanges,
    };
  }

  // ===== INTERACTIVE GAME ENGINE =====

  function WarGameEngine() {
    this.p1Hand = [];
    this.p2Hand = [];
    this.pot = [];
    this.activeDeckId = 'standard';
    this.activeDeck = DECKS.standard;
    this.upgradeCatalog = UPGRADE_CATALOG;

    this.xp = 0;
    this.xpPerWin = 20;
    this.xpToLevel = 100;
    this.criticalXpPercent = 150;
    this.comboXpPercent = 10;
    this.combo = 0;

    this.numUpgradeChoices = 3;
    this.nextCardBoost = 0;
    this.autoWinWar = false;
    this.lossXpPercent = 0;
    this.upgradeHistory = {};
    this.rankBoosts = {};
    this.stats = { rounds: 0, wins: 0, losses: 0, wars: 0, maxCombo: 0, upgradesPicked: 0, cardsStolen: 0 };
  }

  WarGameEngine.prototype.setup = function (deckId) {
    deckId = deckId || this.activeDeckId || 'standard';
    this.activeDeckId = deckId;
    this.activeDeck = DECKS[deckId] || DECKS.standard;

    // Build deck and upgrade catalog for this deck
    var deck = createDeckCards(this.activeDeck);
    shuffle(deck);
    var half = Math.floor(deck.length / 2);
    this.p1Hand = deck.slice(0, half);
    this.p2Hand = deck.slice(half);
    this.pot = [];

    this.upgradeCatalog = buildUpgradeCatalog(this.activeDeck);
    // Also update the global reference
    UPGRADE_CATALOG = this.upgradeCatalog;

    // Scale XP threshold by deck size (52 cards = 100 XP)
    this.xpToLevel = Math.max(30, Math.round(100 * (deck.length / 52)));

    this.xp = 0;
    this.xpPerWin = 20;
    this.criticalXpPercent = 200;
    this.comboXpPercent = 10;
    this.combo = 0;

    this.numUpgradeChoices = 3;
    this.nextCardBoost = 0;
    this.autoWinWar = false;
    this.lossXpPercent = 0;
    this.upgradeHistory = {};
    this.rankBoosts = {};
    this.stats = { rounds: 0, wins: 0, losses: 0, wars: 0, maxCombo: 0, upgradesPicked: 0, cardsStolen: 0 };
  };

  WarGameEngine.prototype.getP1Count = function () { return this.p1Hand.length; };
  WarGameEngine.prototype.getP2Count = function () { return this.p2Hand.length; };

  WarGameEngine.prototype.beginTurn = function () { this.pot = []; };

  WarGameEngine.prototype.drawPlayer = function () {
    if (this.p1Hand.length === 0) return null;
    var card = this.p1Hand.shift();
    this.pot.push({ card: card, owner: 'player' });
    return card;
  };

  WarGameEngine.prototype.drawOpponent = function () {
    if (this.p2Hand.length === 0) return null;
    var card = this.p2Hand.shift();
    this.pot.push({ card: card, owner: 'opponent' });
    return card;
  };

  WarGameEngine.prototype.calcXP = function (isWar) {
    var base = this.xpPerWin;
    var comboMultiplier = 1 + (this.combo * this.comboXpPercent / 100);
    var xp = base * comboMultiplier;
    if (isWar) xp = xp * (this.criticalXpPercent / 100);
    return Math.floor(xp);
  };

  WarGameEngine.prototype.evaluate = function (playerCard, opponentCard) {
    var pv = playerCard.baseValue + (this.rankBoosts[playerCard.rank] || 0);
    var ov = opponentCard.baseValue;
    var boosted = false;
    if (this.nextCardBoost > 0) {
      pv += this.nextCardBoost;
      this.nextCardBoost = 0;
      boosted = true;
    }
    var winner;
    if (pv > ov) winner = 'player';
    else if (ov > pv) winner = 'opponent';
    else winner = 'tie';
    return { winner: winner, playerEffective: pv, opponentEffective: ov, boosted: boosted };
  };

  WarGameEngine.prototype.canAffordWar = function () {
    return this.p1Hand.length >= 4 && this.p2Hand.length >= 4;
  };

  WarGameEngine.prototype.warLoser = function () {
    if (this.p1Hand.length < 4 && this.p2Hand.length < 4)
      return this.p1Hand.length <= this.p2Hand.length ? 'player' : 'opponent';
    if (this.p1Hand.length < 4) return 'player';
    if (this.p2Hand.length < 4) return 'opponent';
    return null;
  };

  WarGameEngine.prototype.forceWarLoss = function () {
    var loserSide = this.warLoser();
    var loserHand = loserSide === 'player' ? this.p1Hand : this.p2Hand;
    var winnerHand = loserSide === 'player' ? this.p2Hand : this.p1Hand;
    for (var i = 0; i < this.pot.length; i++) winnerHand.push(this.pot[i].card);
    while (loserHand.length > 0) winnerHand.push(loserHand.shift());
    this.pot = [];
    return loserSide === 'player' ? 'opponent' : 'player';
  };

  WarGameEngine.prototype.collectToWinner = function (winner) {
    var cards = [];
    for (var i = 0; i < this.pot.length; i++) cards.push(this.pot[i].card);
    shuffle(cards);
    var dest = winner === 'player' ? this.p1Hand : this.p2Hand;
    for (var i = 0; i < cards.length; i++) dest.push(cards[i]);
    this.pot = [];
  };

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

  WarGameEngine.prototype.getUpgradeChoices = function () {
    var n = this.numUpgradeChoices;
    var catalog = this.upgradeCatalog;
    var choices = [];
    var usedKeys = {};

    for (var i = 0; i < n; i++) {
      var rarity = rollRarity();
      var pool = [];
      for (var j = 0; j < catalog.length; j++) {
        if (catalog[j].rarity === rarity && !usedKeys[catalog[j].key]) pool.push(catalog[j]);
      }
      if (pool.length === 0) {
        for (var j = 0; j < catalog.length; j++) {
          if (!usedKeys[catalog[j].key]) pool.push(catalog[j]);
        }
      }
      if (pool.length === 0) break;
      var pick = pool[Math.floor(Math.random() * pool.length)];
      usedKeys[pick.key] = true;
      choices.push({ key: pick.key, name: pick.name, desc: pick.desc, rarity: pick.rarity, icon: pick.icon });
    }
    return choices;
  };

  WarGameEngine.prototype.activateUpgrade = function (key) {
    var catalog = this.upgradeCatalog;
    var def = null;
    for (var i = 0; i < catalog.length; i++) {
      if (catalog[i].key === key) { def = catalog[i]; break; }
    }
    if (!def) return null;

    var result = { key: key, name: def.name, rarity: def.rarity, icon: def.icon };

    switch (key) {
      case 'boost3':  this.nextCardBoost += 3;  break;
      case 'boost5':  this.nextCardBoost += 5;  break;
      case 'boost7':  this.nextCardBoost += 7;  break;
      case 'boost10': this.nextCardBoost += 10; break;
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
      case 'autoWinWar': this.autoWinWar = true; break;
      case 'moreChoices':
        this.numUpgradeChoices += 1;
        result.detail = 'Choices: ' + this.numUpgradeChoices;
        break;
      case 'lossXpUp':
        this.lossXpPercent += 10;
        result.detail = 'Loss XP: ' + this.lossXpPercent + '%';
        break;
      default:
        if (key.indexOf('permBoost2_') === 0) {
          var targetRank = key.substring('permBoost2_'.length);
          if (!this.rankBoosts[targetRank]) this.rankBoosts[targetRank] = 0;
          this.rankBoosts[targetRank] += 2;
          result.detail = 'All ' + targetRank + 's permanently +2';
        } else if (key.indexOf('permBoost_') === 0) {
          var targetRank = key.substring('permBoost_'.length);
          if (!this.rankBoosts[targetRank]) this.rankBoosts[targetRank] = 0;
          this.rankBoosts[targetRank] += 1;
          result.detail = 'All ' + targetRank + 's permanently +1';
        }
        break;
    }

    if (!this.upgradeHistory[key]) this.upgradeHistory[key] = 0;
    this.upgradeHistory[key]++;
    this.stats.upgradesPicked++;
    if (key === 'stealCard' && result.stolenCard) this.stats.cardsStolen++;

    return result;
  };

  WarGameEngine.prototype.isGameOver = function () {
    if (this.p1Hand.length === 0) return { over: true, winner: 'opponent' };
    if (this.p2Hand.length === 0) return { over: true, winner: 'player' };
    return { over: false, winner: null };
  };

  // ===== EXPORTS =====

  exports.SUITS = SUITS;
  exports.SUIT_SYMBOLS = SUIT_SYMBOLS;
  exports.DECKS = DECKS;
  exports.createDeck = createDeck;
  exports.createFullDeck = createFullDeck;
  exports.createDeckCards = createDeckCards;
  exports.buildUpgradeCatalog = buildUpgradeCatalog;
  exports.shuffle = shuffle;
  exports.cardValue = cardValue;
  exports.percentile = percentile;
  exports.stddev = stddev;
  exports.RARITY_WEIGHTS = RARITY_WEIGHTS;
  exports.rollRarity = rollRarity;
  // UPGRADE_CATALOG is dynamic now but keep the export for compat
  Object.defineProperty(exports, 'UPGRADE_CATALOG', { get: function () { return UPGRADE_CATALOG; } });
  exports.BASE_UPGRADES = BASE_UPGRADES;
  exports.playWarGame = playWarGame;
  exports.WarGameEngine = WarGameEngine;

})(typeof module !== 'undefined' && module.exports
  ? module.exports
  : (typeof window !== 'undefined' ? (window.WarSimulation = {}) : (this.WarSimulation = {})));

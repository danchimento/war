/**
 * War Card Game — UI Layer
 *
 * Pure rendering and animation layer. All game logic lives in war-simulation.js
 * and is accessed via the WarSimulation global (WarGameEngine class).
 */

// ===== UI CONSTANTS =====

var WS = window.WarSimulation;

var UI_STATES = Object.freeze({
  IDLE: 'IDLE',
  OPPONENT_PLAYS: 'OPPONENT_PLAYS',
  WAITING_FOR_PLAYER: 'WAITING_FOR_PLAYER',
  FLIP_PHASE: 'FLIP_PHASE',
  RESOLVE_WIN: 'RESOLVE_WIN',
  RESOLVE_WAR: 'RESOLVE_WAR',
  CHECK_UPGRADE: 'CHECK_UPGRADE',
  UPGRADE_CHOICE: 'UPGRADE_CHOICE',
  GAME_OVER: 'GAME_OVER',
});

// ===== CARD DOM HELPERS =====

/** Create a DOM element for a card object { suit, rank, value }. Starts face-down. */
function createCardElement(card) {
  var div = document.createElement('div');
  div.className = 'card';
  div.dataset.suit = card.suit;
  div.dataset.rank = card.rank;
  div.dataset.value = card.value;

  var front = document.createElement('div');
  front.className = 'card-front';
  front.style.display = 'none';

  var rankTop = document.createElement('span');
  rankTop.className = 'rank';
  rankTop.textContent = card.rank;

  var suitCenter = document.createElement('span');
  suitCenter.className = 'suit';
  suitCenter.textContent = WS.SUIT_SYMBOLS[card.suit];

  var rankBottom = document.createElement('span');
  rankBottom.className = 'rank-bottom';
  rankBottom.textContent = card.rank;

  front.appendChild(rankTop);
  front.appendChild(suitCenter);
  front.appendChild(rankBottom);

  var back = document.createElement('div');
  back.className = 'card-back';

  div.appendChild(front);
  div.appendChild(back);

  return div;
}

function showCardFront(el) {
  var front = el.querySelector('.card-front');
  var back = el.querySelector('.card-back');
  if (front) front.style.display = '';
  if (back) back.style.display = 'none';
}

function showCardBack(el) {
  var front = el.querySelector('.card-front');
  var back = el.querySelector('.card-back');
  if (front) front.style.display = 'none';
  if (back) back.style.display = '';
}

// ===== DECK VIEW (visual-only, no card data) =====

function DeckView(containerEl) {
  this.containerEl = containerEl;
  this.countEl = containerEl.querySelector('.deck-count');
  this.stackEl = containerEl.querySelector('.deck-stack');
}

DeckView.prototype.update = function (count) {
  this.countEl.textContent = count;
  this.stackEl.innerHTML = '';

  if (count === 0) {
    this.containerEl.classList.add('empty');
    return;
  }

  this.containerEl.classList.remove('empty');
  var depth = Math.min(3, count);
  for (var i = 0; i < depth; i++) {
    var back = document.createElement('div');
    back.className = 'card-back';
    this.stackEl.appendChild(back);
  }
};

// ===== ANIMATION HELPERS =====

var Anim = {
  playCard: function (cardEl, fromEl, toEl) {
    var fromRect = fromEl.getBoundingClientRect();
    var toRect = toEl.getBoundingClientRect();
    var dx = fromRect.left - toRect.left;
    var dy = fromRect.top - toRect.top;

    return gsap.from(cardEl, {
      x: dx, y: dy, duration: 0.25, ease: 'power2.out',
    });
  },

  flipUp: function (cardEl) {
    var tl = gsap.timeline();
    tl.to(cardEl, { scaleX: 0, duration: 0.15, ease: 'power2.in' })
      .call(function () { showCardFront(cardEl); })
      .to(cardEl, { scaleX: 1, duration: 0.15, ease: 'power2.out' });
    return tl;
  },

  collectCards: function (cardEls, destEl) {
    var destRect = destEl.getBoundingClientRect();
    var tl = gsap.timeline();

    cardEls.forEach(function (el, i) {
      if (!el || !el.getBoundingClientRect) return;
      var elRect = el.getBoundingClientRect();
      var dx = destRect.left - elRect.left;
      var dy = destRect.top - elRect.top;

      tl.call(function () { showCardBack(el); }, null, i * 0.12);
      tl.to(el, {
        x: dx, y: dy, scale: 0.7, opacity: 0,
        duration: 0.3, ease: 'power2.in',
        onComplete: function () { if (el.parentNode) el.remove(); },
      }, i * 0.12);
    });

    return tl;
  },

  warSlam: function (cardEl) {
    return gsap.from(cardEl, {
      y: -80, scale: 1.3, opacity: 0,
      duration: 0.25, ease: 'back.out(1.7)',
    });
  },

  resultFlash: function (text, color) {
    var el = document.getElementById('result-flash');
    el.textContent = text;
    el.style.color = color || '#fff';

    return gsap.timeline()
      .set(el, { opacity: 1, scale: 0.5 })
      .to(el, { scale: 1.2, duration: 0.2, ease: 'power2.out' })
      .to(el, { scale: 1, duration: 0.1 })
      .to(el, { opacity: 0, duration: 0.3, delay: 0.4 });
  },

  delay: function (seconds) {
    return new Promise(function (resolve) { gsap.delayedCall(seconds, resolve); });
  },
};

// ===== STATUS BADGE RENDERER =====

function renderStatusBadges(engine, container) {
  container.innerHTML = '';
  if (engine.nextCardBoost > 0) {
    var span = document.createElement('span');
    span.className = 'upgrade-badge';
    span.textContent = '\u2B06 +' + engine.nextCardBoost + ' next card';
    container.appendChild(span);
  }
  if (engine.autoWinWar) {
    var span = document.createElement('span');
    span.className = 'upgrade-badge upgrade-badge--epic';
    span.textContent = '\uD83D\uDC51 Auto-Win War';
    container.appendChild(span);
  }
  if (engine.combo > 0) {
    var span = document.createElement('span');
    span.className = 'upgrade-badge upgrade-badge--combo';
    span.textContent = '\uD83D\uDD25 x' + engine.combo + ' combo';
    container.appendChild(span);
  }
}

// ===== GAME UI =====

function GameUI() {
  this.state = UI_STATES.IDLE;
  this.engine = new WS.WarGameEngine();

  // Card element tracking: Map<card object, DOM element>
  this.cardElements = new Map();
  this.roundHadWar = false;

  this.els = {
    playerDeckEl: document.getElementById('player-deck'),
    opponentDeckEl: document.getElementById('opponent-deck'),
    playerBattle: document.getElementById('player-battle'),
    opponentBattle: document.getElementById('opponent-battle'),
    warPilePlayer: document.getElementById('war-pile-player'),
    warPileOpponent: document.getElementById('war-pile-opponent'),
    xpFill: document.getElementById('xp-bar-fill'),
    xpLabel: document.getElementById('xp-bar-label'),
    xpContainer: document.getElementById('xp-bar-container'),
    upgradeOverlay: document.getElementById('upgrade-overlay'),
    upgradeChoices: document.getElementById('upgrade-choices'),
    gameoverOverlay: document.getElementById('gameover-overlay'),
    gameoverMessage: document.getElementById('gameover-message'),
    tapPrompt: document.getElementById('tap-prompt'),
    activeUpgrades: document.getElementById('active-upgrades'),
    restartBtn: document.getElementById('restart-btn'),
  };

  this.playerDeckView = new DeckView(this.els.playerDeckEl);
  this.opponentDeckView = new DeckView(this.els.opponentDeckEl);

  this.bindEvents();
  this.start();
}

GameUI.prototype.start = function () {
  this.state = UI_STATES.IDLE;
  this.cardElements = new Map();
  this.roundHadWar = false;

  this.els.gameoverOverlay.classList.add('hidden');
  this.els.upgradeOverlay.classList.add('hidden');
  this.clearBattleZone();

  this.engine.setup();
  this.syncDecks();
  this.updateXPBar();
  this.renderStatus();
  this.beginRound();
};

GameUI.prototype.bindEvents = function () {
  var self = this;
  var tapHandler = function (e) {
    e.preventDefault();
    self.onPlayerTap();
  };
  this.els.playerDeckEl.addEventListener('click', tapHandler);
  this.els.playerDeckEl.addEventListener('touchend', tapHandler);
  this.els.restartBtn.addEventListener('click', function () { self.start(); });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
};

// --- Visual sync helpers ---

GameUI.prototype.syncDecks = function () {
  this.playerDeckView.update(this.engine.getP1Count());
  this.opponentDeckView.update(this.engine.getP2Count());
};

GameUI.prototype.updateXPBar = function () {
  var progress = this.engine.getXPProgress();
  var pct = Math.min(100, progress.percentage);
  this.els.xpFill.style.width = pct + '%';
  this.els.xpLabel.textContent = 'XP: ' + progress.current + ' / ' + progress.needed;
};

GameUI.prototype.renderStatus = function () {
  renderStatusBadges(this.engine, this.els.activeUpgrades);
};

/** Create a card DOM element and track it. */
GameUI.prototype.makeCardEl = function (card) {
  var el = createCardElement(card);
  this.cardElements.set(card, el);
  return el;
};

/** Get tracked DOM element for a card, or null. */
GameUI.prototype.getCardEl = function (card) {
  return this.cardElements.get(card) || null;
};

/** Remove card element tracking. */
GameUI.prototype.releaseCardEl = function (card) {
  this.cardElements.delete(card);
};

// --- Turn flow ---

GameUI.prototype.beginRound = async function () {
  var status = this.engine.isGameOver();
  if (status.over) { this.endGame(status.winner); return; }

  this.state = UI_STATES.OPPONENT_PLAYS;
  this.clearBattleZone();

  // Engine draws opponent card
  this.engine.beginTurn();
  var oppCard = this.engine.drawOpponent();
  if (!oppCard) { this.endGame('player'); return; }

  // Animate opponent card face-down to battle slot
  var oppEl = this.makeCardEl(oppCard);
  this.els.opponentBattle.appendChild(oppEl);
  await Anim.playCard(oppEl, this.els.opponentDeckEl, this.els.opponentBattle);
  this.syncDecks();

  // Wait for player
  this.state = UI_STATES.WAITING_FOR_PLAYER;
  this.els.tapPrompt.classList.remove('hidden');
};

GameUI.prototype.onPlayerTap = async function () {
  if (this.state !== UI_STATES.WAITING_FOR_PLAYER) return;
  this.state = UI_STATES.FLIP_PHASE;
  this.els.tapPrompt.classList.add('hidden');

  // Engine draws player card
  var pCard = this.engine.drawPlayer();
  if (!pCard) { this.endGame('opponent'); return; }

  // Animate player card face-down to battle slot
  var pEl = this.makeCardEl(pCard);
  this.els.playerBattle.appendChild(pEl);
  await Anim.playCard(pEl, this.els.playerDeckEl, this.els.playerBattle);
  this.syncDecks();

  // Store the current battle cards for flipAndEvaluate
  await this.flipAndEvaluate(pCard, this.engine.pot[0].card);
};

GameUI.prototype.flipAndEvaluate = async function (playerCard, opponentCard) {
  this.state = UI_STATES.FLIP_PHASE;

  var pEl = this.getCardEl(playerCard);
  var oEl = this.getCardEl(opponentCard);

  // Flip both simultaneously
  await Promise.all([
    Anim.flipUp(oEl),
    Anim.flipUp(pEl),
  ]);

  await Anim.delay(0.3);

  // Ask engine to evaluate
  var result = this.engine.evaluate(playerCard, opponentCard);

  if (result.winner === 'tie') {
    await this.resolveWar();
  } else {
    await this.resolveWin(result.winner);
  }
};

GameUI.prototype.resolveWin = async function (winner) {
  this.state = UI_STATES.RESOLVE_WIN;
  var leveledUp = false;

  var label = winner === 'player' ? 'YOU WIN!' : 'YOU LOSE';
  var color = winner === 'player' ? '#2ecc71' : '#e74c3c';

  // Show critical flash for war wins
  if (this.roundHadWar && winner === 'player') {
    label = 'CRITICAL WIN!';
    color = '#f1c40f';
  }
  await Anim.resultFlash(label, color);

  // Collect all visible card elements to winner's deck
  var allEls = this.getAllVisibleCardEls();
  var destEl = winner === 'player' ? this.els.playerDeckEl : this.els.opponentDeckEl;

  if (allEls.length > 0) {
    await Anim.collectCards(allEls, destEl);
  }

  // Engine handles card redistribution
  this.engine.collectToWinner(winner);

  // XP and combo for player wins
  if (winner === 'player') {
    this.engine.combo++;
    var xpGain = this.engine.calcXP(this.roundHadWar);
    leveledUp = this.engine.addXP(xpGain);
  } else {
    this.engine.combo = 0;
  }

  // Release all tracked card elements
  this.cardElements = new Map();
  this.roundHadWar = false;

  this.renderStatus();
  this.syncDecks();
  this.clearBattleZone();
  await this.checkUpgrade(leveledUp);
};

GameUI.prototype.resolveWar = async function () {
  this.state = UI_STATES.RESOLVE_WAR;
  this.roundHadWar = true;

  // Auto-win war upgrade
  if (this.engine.autoWinWar) {
    this.engine.autoWinWar = false;
    await Anim.resultFlash('AUTO-WIN!', '#f1c40f');
    this.engine.collectToWinner('player');
    this.renderStatus();

    // Collect visible cards then resolve as player win
    var allEls = this.getAllVisibleCardEls();
    if (allEls.length > 0) await Anim.collectCards(allEls, this.els.playerDeckEl);
    this.cardElements = new Map();
    this.syncDecks();
    this.clearBattleZone();

    // Give XP as a war win
    this.engine.combo++;
    var xpGain = this.engine.calcXP(true);
    var leveledUp = this.engine.addXP(xpGain);
    this.roundHadWar = false;
    this.renderStatus();
    await this.checkUpgrade(leveledUp);
    return;
  }

  await Anim.resultFlash('WAR!', '#f1c40f');

  // Check if both sides can afford war
  if (!this.engine.canAffordWar()) {
    // Force loss — engine moves all cards to winner
    var winner = this.engine.forceWarLoss();
    this.syncDecks();
    this.endGame(winner);
    return;
  }

  // Engine deals 3 face-down + 1 reveal per side
  var warCards = this.engine.dealWarCards();
  this.syncDecks();

  // Animate face-down war cards
  for (var i = 0; i < 3; i++) {
    var oCard = warCards.p2FaceDown[i];
    var oEl = this.makeCardEl(oCard);
    this.els.warPileOpponent.appendChild(oEl);
    await Anim.warSlam(oEl);

    var pCard = warCards.p1FaceDown[i];
    var pEl = this.makeCardEl(pCard);
    this.els.warPilePlayer.appendChild(pEl);
    await Anim.warSlam(pEl);
  }

  await Anim.delay(0.2);

  // Clear battle slots for reveal cards
  this.els.opponentBattle.innerHTML = '';
  this.els.playerBattle.innerHTML = '';

  // Animate reveal cards
  var oppRevealEl = this.makeCardEl(warCards.p2Reveal);
  this.els.opponentBattle.appendChild(oppRevealEl);
  await Anim.playCard(oppRevealEl, this.els.opponentDeckEl, this.els.opponentBattle);

  var pRevealEl = this.makeCardEl(warCards.p1Reveal);
  this.els.playerBattle.appendChild(pRevealEl);
  await Anim.playCard(pRevealEl, this.els.playerDeckEl, this.els.playerBattle);

  // Flip and evaluate the reveal cards (may recurse if another tie)
  await this.flipAndEvaluate(warCards.p1Reveal, warCards.p2Reveal);
};

// --- XP & Upgrades ---

GameUI.prototype.checkUpgrade = async function (leveledUp) {
  this.state = UI_STATES.CHECK_UPGRADE;
  this.updateXPBar();

  if (leveledUp) {
    // Flash XP bar
    this.els.xpContainer.classList.add('flash');
    var xpContainer = this.els.xpContainer;
    setTimeout(function () { xpContainer.classList.remove('flash'); }, 600);

    await Anim.delay(0.3);
    await this.showUpgradeChoice();
    this.updateXPBar();
  }

  var status = this.engine.isGameOver();
  if (status.over) { this.endGame(status.winner); return; }

  this.state = UI_STATES.IDLE;
  this.beginRound();
};

GameUI.prototype.showUpgradeChoice = function () {
  var self = this;
  return new Promise(function (resolve) {
    self.state = UI_STATES.UPGRADE_CHOICE;
    var choices = self.engine.getUpgradeChoices();
    self.els.upgradeChoices.innerHTML = '';

    choices.forEach(function (ch) {
      var div = document.createElement('div');
      div.className = 'upgrade-card upgrade-card--' + ch.rarity;
      div.innerHTML = '<div class="upgrade-rarity-tag">' + ch.rarity.toUpperCase() + '</div>' +
        '<h3>' + ch.icon + ' ' + ch.name + '</h3><p>' + ch.desc + '</p>';
      div.addEventListener('click', function () {
        self.engine.activateUpgrade(ch.key);
        self.renderStatus();
        self.syncDecks();
        self.els.upgradeOverlay.classList.add('hidden');
        resolve();
      });
      self.els.upgradeChoices.appendChild(div);
    });

    self.els.upgradeOverlay.classList.remove('hidden');
  });
};

// --- Game Over ---

GameUI.prototype.endGame = function (winner) {
  this.state = UI_STATES.GAME_OVER;
  this.els.tapPrompt.classList.add('hidden');
  this.els.gameoverMessage.textContent = winner === 'player' ? 'You Win!' : 'You Lose!';
  this.els.gameoverMessage.style.color = winner === 'player' ? '#2ecc71' : '#e74c3c';
  this.els.gameoverOverlay.classList.remove('hidden');
};

// --- Helpers ---

GameUI.prototype.clearBattleZone = function () {
  this.els.opponentBattle.innerHTML = '';
  this.els.playerBattle.innerHTML = '';
  this.els.warPileOpponent.innerHTML = '';
  this.els.warPilePlayer.innerHTML = '';
};

GameUI.prototype.getAllVisibleCardEls = function () {
  var els = [];
  this.cardElements.forEach(function (el) {
    if (el && el.parentNode) els.push(el);
  });
  return els;
};

// ===== BOOT =====

document.addEventListener('DOMContentLoaded', function () {
  window.game = new GameUI();
});

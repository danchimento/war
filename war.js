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
  WAITING_FOR_PLAYER: 'WAITING_FOR_PLAYER',
  ANIMATING: 'ANIMATING',
  WAR_TAP: 'WAR_TAP',
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

/** Show or update a boost badge (+N) on a card element. */
function updateBoostBadge(cardEl, totalBoost) {
  if (totalBoost <= 0) return;
  var existing = cardEl.querySelector('.card-boost-badge');
  if (existing) existing.remove();
  var badge = document.createElement('span');
  badge.className = 'card-boost-badge';
  badge.textContent = '+' + totalBoost;
  cardEl.appendChild(badge);
  gsap.from(badge, { scale: 0, duration: 0.3, ease: 'back.out(2)' });
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

function isFaceDown(el) {
  var back = el.querySelector('.card-back');
  return back && back.style.display !== 'none';
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
  /** Animate card from fromEl position to its current DOM position. */
  playCard: function (cardEl, fromEl) {
    var fromRect = fromEl.getBoundingClientRect();
    var toRect = cardEl.getBoundingClientRect();
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

  /** Flip all face-down cards in the given containers. */
  flipAllFaceDown: function (containers) {
    var cards = [];
    for (var c = 0; c < containers.length; c++) {
      var els = containers[c].querySelectorAll('.card');
      for (var i = 0; i < els.length; i++) {
        if (isFaceDown(els[i])) cards.push(els[i]);
      }
    }
    if (cards.length === 0) return Promise.resolve();

    var tl = gsap.timeline();
    for (var i = 0; i < cards.length; i++) {
      tl.add(Anim.flipUp(cards[i]), i * 0.06);
    }
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

      tl.to(el, {
        x: dx, y: dy, scale: 0.7, opacity: 0,
        duration: 0.3, ease: 'power2.in',
        onComplete: function () { if (el.parentNode) el.remove(); },
      }, i * 0.08);
    });

    return tl;
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
    span.dataset.desc = 'Your next card gets +' + engine.nextCardBoost + ' to its value.';
    span.textContent = '\u2B06 +' + engine.nextCardBoost + ' next card';
    container.appendChild(span);
  }
  if (engine.autoWinWar) {
    var span = document.createElement('span');
    span.className = 'upgrade-badge upgrade-badge--epic';
    span.dataset.desc = 'You will automatically win the next war.';
    span.textContent = '\uD83D\uDC51 Auto-Win War';
    container.appendChild(span);
  }
}

// ===== GAME UI =====

function GameUI() {
  this.state = UI_STATES.IDLE;
  this.engine = new WS.WarGameEngine();

  // Card element tracking
  this.cardElements = new Map();
  this.roundHadWar = false;
  this.autoWinActive = false;
  this.lastPlayerCount = 26;
  this.warState = null;
  this.warOpponentTimer = null;

  this.els = {
    playerDeckEl: document.getElementById('player-deck'),
    opponentDeckEl: document.getElementById('opponent-deck'),
    playerCards: document.getElementById('player-cards'),
    opponentCards: document.getElementById('opponent-cards'),
    xpFill: document.getElementById('xp-bar-fill'),
    xpLabel: document.getElementById('xp-bar-label'),
    xpContainer: document.getElementById('xp-bar-container'),
    upgradeOverlay: document.getElementById('upgrade-overlay'),
    upgradeChoices: document.getElementById('upgrade-choices'),
    gameoverOverlay: document.getElementById('gameover-overlay'),
    gameoverMessage: document.getElementById('gameover-message'),
    activeUpgrades: document.getElementById('active-upgrades'),
    badgeTooltip: document.getElementById('badge-tooltip'),
    restartBtn: document.getElementById('restart-btn'),
    evalBarFill: document.getElementById('eval-bar-fill'),
    evalBar: document.getElementById('eval-bar'),
    comboDisplay: document.getElementById('combo-display'),
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
  this.autoWinActive = false;
  this.lastPlayerCount = 26;
  this.warState = null;
  if (this.warOpponentTimer) { this.warOpponentTimer.kill(); this.warOpponentTimer = null; }

  this.els.gameoverOverlay.classList.add('hidden');
  this.els.upgradeOverlay.classList.add('hidden');
  this.clearBattleZone();
  this.hideCombo();

  this.engine.setup();
  this.syncDecks();
  this.updateXPBar();
  this.updateEvalBar();
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

  // Badge tooltip
  this.els.activeUpgrades.addEventListener('click', function (e) {
    var badge = e.target.closest('.upgrade-badge');
    if (badge && badge.dataset.desc) {
      self.showBadgeTooltip(badge.dataset.desc);
    }
  });
};

// --- Visual sync helpers ---

GameUI.prototype.syncDecks = function () {
  this.playerDeckView.update(this.engine.getP1Count());
  this.opponentDeckView.update(this.engine.getP2Count());
  this.updateEvalBar();
};

GameUI.prototype.updateXPBar = function () {
  var progress = this.engine.getXPProgress();
  var pct = Math.min(100, progress.percentage);
  this.els.xpFill.style.width = pct + '%';
  this.els.xpLabel.textContent = 'XP: ' + progress.current + ' / ' + progress.needed;
};

GameUI.prototype.updateEvalBar = function () {
  var p1 = this.engine.getP1Count();
  var p2 = this.engine.getP2Count();
  var total = p1 + p2;
  if (total === 0) return;

  // Sigmoid scaling: stretch differences near the middle, compress extremes
  // advantage ranges from -1 (all opponent) to +1 (all player)
  var advantage = (p1 - p2) / total;
  // Sigmoid: 1 / (1 + e^(-k*x)), k controls steepness
  var sigmoid = 1 / (1 + Math.exp(-4 * advantage));
  var playerPct = sigmoid * 100;

  this.els.evalBarFill.style.height = playerPct + '%';

  // Show +N/-N popup when card count changes
  var delta = p1 - this.lastPlayerCount;
  if (delta !== 0 && this.lastPlayerCount !== undefined) {
    this.showEvalPopup(delta);
  }
  this.lastPlayerCount = p1;
};

GameUI.prototype.showEvalPopup = function (delta) {
  var barRect = this.els.evalBar.getBoundingClientRect();
  var popup = document.createElement('div');
  popup.className = 'eval-bar-popup';
  popup.textContent = (delta > 0 ? '+' : '') + delta;
  popup.style.color = delta > 0 ? 'rgba(46,204,113,.9)' : 'rgba(231,76,60,.9)';
  popup.style.left = (barRect.right + 4) + 'px';
  popup.style.top = (barRect.top + barRect.height / 2) + 'px';
  document.body.appendChild(popup);

  gsap.fromTo(popup,
    { opacity: 1, y: 0 },
    { opacity: 0, y: delta > 0 ? -20 : 20, duration: 1, ease: 'power2.out', onComplete: function () { popup.remove(); } }
  );
};

GameUI.prototype.showXPPopup = function (amount) {
  var rect = this.els.xpContainer.getBoundingClientRect();
  var popup = document.createElement('div');
  popup.className = 'xp-popup';
  popup.textContent = '+' + amount + ' XP';
  document.body.appendChild(popup);

  // Position above the XP bar center
  popup.style.left = (rect.left + rect.width / 2) + 'px';
  popup.style.top = rect.top + 'px';

  gsap.fromTo(popup,
    { opacity: 1, y: 0 },
    { opacity: 0, y: -30, duration: 1.2, ease: 'power2.out', onComplete: function () { popup.remove(); } }
  );
};

GameUI.prototype.renderStatus = function () {
  renderStatusBadges(this.engine, this.els.activeUpgrades);
  this.updateCombo();
};

GameUI.prototype.updateCombo = function () {
  var combo = this.engine.combo;
  var el = this.els.comboDisplay;
  if (combo >= 2) {
    el.textContent = 'x' + combo + ' COMBO';
    el.classList.remove('hidden');
    gsap.fromTo(el, { scale: 1.3 }, { scale: 1, duration: 0.25, ease: 'back.out(2)' });
  } else {
    el.classList.add('hidden');
  }
};

GameUI.prototype.hideCombo = function () {
  this.els.comboDisplay.classList.add('hidden');
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

// --- Badge tooltip ---

GameUI.prototype.showBadgeTooltip = function (desc) {
  var tooltip = this.els.badgeTooltip;
  tooltip.textContent = desc;
  tooltip.classList.remove('hidden');

  clearTimeout(this._tooltipTimer);
  this._tooltipTimer = setTimeout(function () {
    tooltip.classList.add('hidden');
  }, 2000);
};

// --- Turn flow ---

GameUI.prototype.beginRound = async function () {
  var status = this.engine.isGameOver();
  if (status.over) { this.endGame(status.winner); return; }

  this.clearBattleZone();
  this.engine.beginTurn();
  this.state = UI_STATES.WAITING_FOR_PLAYER;
};

GameUI.prototype.onPlayerTap = async function () {
  if (this.state === UI_STATES.WAITING_FOR_PLAYER) {
    await this.playInitialCards();
  } else if (this.state === UI_STATES.WAR_TAP) {
    await this.playPlayerWarCard();
  }
};

/** Player taps deck → both sides play a card → flip → evaluate. */
GameUI.prototype.playInitialCards = async function () {
  this.state = UI_STATES.ANIMATING;

  // Draw player card
  var pCard = this.engine.drawPlayer();
  if (!pCard) { this.endGame('opponent'); return; }
  var pEl = this.makeCardEl(pCard);
  this.els.playerCards.appendChild(pEl);
  await Anim.playCard(pEl, this.els.playerDeckEl);

  // Draw opponent card
  var oCard = this.engine.drawOpponent();
  if (!oCard) { this.endGame('player'); return; }
  var oEl = this.makeCardEl(oCard);
  this.els.opponentCards.appendChild(oEl);
  await Anim.playCard(oEl, this.els.opponentDeckEl);

  this.syncDecks();

  // Flip both simultaneously
  await Promise.all([Anim.flipUp(pEl), Anim.flipUp(oEl)]);

  // Show permanent boost badge if applicable
  if (pCard.value > pCard.baseValue) {
    updateBoostBadge(pEl, pCard.value - pCard.baseValue);
  }
  await Anim.delay(0.3);

  // Evaluate
  var result = this.engine.evaluate(pCard, oCard);

  // Show boost badge (combined permanent + temporary)
  if (result.boosted) {
    updateBoostBadge(pEl, result.playerEffective - pCard.baseValue);
    await Anim.delay(0.3);
  }

  if (result.winner === 'tie') {
    await this.resolveWar();
  } else {
    await this.resolveWin(result.winner);
  }
};

/** Player taps to play one of their war cards. */
GameUI.prototype.playPlayerWarCard = async function () {
  var ws = this.warState;
  if (!ws || ws.playerPlayed >= 4) return;

  this.state = UI_STATES.ANIMATING;

  var pCard = this.engine.drawPlayer();
  if (!pCard) return;

  ws.playerPlayed++;
  ws.playerCards.push(pCard);

  var pEl = this.makeCardEl(pCard);
  this.els.playerCards.appendChild(pEl);
  ws.playerEls.push(pEl);
  await Anim.playCard(pEl, this.els.playerDeckEl);
  this.syncDecks();

  if (ws.playerPlayed < 4) {
    this.state = UI_STATES.WAR_TAP;
  }

  this.checkWarComplete();
};

/** Opponent auto-plays one war card on a timer. */
GameUI.prototype.scheduleOpponentWarCard = function () {
  var self = this;
  var delay = 0.2 + Math.random() * 0.15;
  this.warOpponentTimer = gsap.delayedCall(delay, function () {
    self.playOpponentWarCard();
  });
};

GameUI.prototype.playOpponentWarCard = async function () {
  var ws = this.warState;
  if (!ws || ws.opponentPlayed >= 4) return;

  var oCard = this.engine.drawOpponent();
  if (!oCard) return;

  ws.opponentPlayed++;
  ws.opponentCards.push(oCard);

  var oEl = this.makeCardEl(oCard);
  this.els.opponentCards.appendChild(oEl);
  ws.opponentEls.push(oEl);
  await Anim.playCard(oEl, this.els.opponentDeckEl);
  this.syncDecks();

  if (ws.opponentPlayed < 4) {
    this.scheduleOpponentWarCard();
  }

  this.checkWarComplete();
};

/** When both sides have played all 4 war cards, flip reveal and evaluate. */
GameUI.prototype.checkWarComplete = async function () {
  var ws = this.warState;
  if (!ws || ws.playerPlayed < 4 || ws.opponentPlayed < 4 || ws.resolving) return;
  ws.resolving = true;
  this.state = UI_STATES.ANIMATING;

  var pEl = ws.playerEls[3];
  var oEl = ws.opponentEls[3];
  var pCard = ws.playerCards[3];
  var oCard = ws.opponentCards[3];

  await Promise.all([Anim.flipUp(pEl), Anim.flipUp(oEl)]);

  // Show permanent boost badge
  if (pCard.value > pCard.baseValue) {
    updateBoostBadge(pEl, pCard.value - pCard.baseValue);
  }
  await Anim.delay(0.3);

  var result = this.engine.evaluate(pCard, oCard);

  if (result.boosted) {
    updateBoostBadge(pEl, result.playerEffective - pCard.baseValue);
    await Anim.delay(0.3);
  }

  if (this.autoWinActive) {
    this.autoWinActive = false;
    await Anim.resultFlash('AUTO-WIN!', '#f1c40f');
    await this.resolveWin('player');
  } else if (result.winner === 'tie') {
    await this.resolveWar();
  } else {
    await this.resolveWin(result.winner);
  }
};

GameUI.prototype.resolveWin = async function (winner) {
  this.state = UI_STATES.ANIMATING;
  var leveledUp = false;

  var label = winner === 'player' ? 'YOU WIN!' : 'YOU LOSE';
  var color = winner === 'player' ? '#2ecc71' : '#e74c3c';

  if (this.roundHadWar && winner === 'player') {
    label = 'CRITICAL WIN!';
    color = '#f1c40f';
  }
  await Anim.resultFlash(label, color);

  // Flip all face-down cards so player sees what was won
  await Anim.flipAllFaceDown([this.els.playerCards, this.els.opponentCards]);
  await Anim.delay(0.5);

  // Collect all visible card elements to winner's deck
  var allEls = this.getAllVisibleCardEls();
  var destEl = winner === 'player' ? this.els.playerDeckEl : this.els.opponentDeckEl;

  if (allEls.length > 0) {
    await Anim.collectCards(allEls, destEl);
  }

  // Engine handles card redistribution
  this.engine.collectToWinner(winner);

  // XP and combo for player wins (calc XP before incrementing combo
  // so first win = base XP, combo bonus starts on 2nd consecutive win)
  if (winner === 'player') {
    var xpGain = this.engine.calcXP(this.roundHadWar);
    this.showXPPopup(xpGain);
    leveledUp = this.engine.addXP(xpGain);
    this.engine.combo++;
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
  this.roundHadWar = true;

  // Set auto-win flag if active (war still plays out visually)
  if (this.engine.autoWinWar) {
    this.autoWinActive = true;
    this.engine.autoWinWar = false;
    this.renderStatus();
  }

  await Anim.resultFlash('WAR!', '#f1c40f');

  // Check if both sides can afford war
  if (!this.engine.canAffordWar()) {
    var winner = this.engine.forceWarLoss();
    this.syncDecks();
    this.endGame(winner);
    return;
  }

  // Independent war flow: opponent auto-plays on timer, player taps
  if (this.warOpponentTimer) { this.warOpponentTimer.kill(); this.warOpponentTimer = null; }
  this.warState = {
    playerPlayed: 0,
    opponentPlayed: 0,
    playerCards: [],
    opponentCards: [],
    playerEls: [],
    opponentEls: [],
    resolving: false,
  };
  this.state = UI_STATES.WAR_TAP;
  this.scheduleOpponentWarCard();
};

// --- XP & Upgrades ---

GameUI.prototype.checkUpgrade = async function (leveledUp) {
  this.state = UI_STATES.CHECK_UPGRADE;
  this.updateXPBar();

  if (leveledUp) {
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
        var result = self.engine.activateUpgrade(ch.key);
        self.renderStatus();
        self.syncDecks();
        self.els.upgradeOverlay.classList.add('hidden');

        // Show stolen card before resolving
        if (result && result.stolenCard) {
          self.showStolenCard(result.stolenCard).then(resolve);
        } else {
          resolve();
        }
      });
      self.els.upgradeChoices.appendChild(div);
    });

    self.els.upgradeOverlay.classList.remove('hidden');
  });
};

/** Show stolen card in the battle zone, then animate it to the player's deck. */
GameUI.prototype.showStolenCard = async function (card) {
  var cardEl = createCardElement(card);
  this.els.playerCards.appendChild(cardEl);
  showCardFront(cardEl);

  // Scale in from center
  gsap.set(cardEl, { scale: 0 });
  await gsap.to(cardEl, { scale: 1.2, duration: 0.3, ease: 'back.out(2)' });
  await Anim.resultFlash('STOLEN!', '#3498db');
  await Anim.delay(0.5);

  // Animate to player's deck
  await Anim.collectCards([cardEl], this.els.playerDeckEl);
  this.clearBattleZone();
  this.syncDecks();
};

// --- Game Over ---

GameUI.prototype.endGame = function (winner) {
  this.state = UI_STATES.GAME_OVER;
  this.els.gameoverMessage.textContent = winner === 'player' ? 'You Win!' : 'You Lose!';
  this.els.gameoverMessage.style.color = winner === 'player' ? '#2ecc71' : '#e74c3c';
  this.els.gameoverOverlay.classList.remove('hidden');
};

// --- Helpers ---

GameUI.prototype.clearBattleZone = function () {
  this.els.playerCards.innerHTML = '';
  this.els.opponentCards.innerHTML = '';
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

/**
 * War Card Game — UI Layer
 */

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

function isFaceDown(el) {
  var back = el.querySelector('.card-back');
  return back && back.style.display !== 'none';
}

// ===== DECK VIEW =====

function DeckView(containerEl) {
  this.containerEl = containerEl;
  this.countEl = containerEl.querySelector('.deck-count');
  this.stackEl = containerEl.querySelector('.deck-stack');
}

DeckView.prototype.update = function (count) {
  this.countEl.textContent = count;
  this.stackEl.innerHTML = '';
  if (count === 0) { this.containerEl.classList.add('empty'); return; }
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
  playCard: function (cardEl, fromEl) {
    var fromRect = fromEl.getBoundingClientRect();
    var toRect = cardEl.getBoundingClientRect();
    var dx = fromRect.left - toRect.left;
    var dy = fromRect.top - toRect.top;
    return gsap.from(cardEl, { x: dx, y: dy, duration: 0.25, ease: 'power2.out' });
  },

  /** Play card with mid-flight flip — card flies out and flips face-up during the move. */
  playCardFaceUp: function (cardEl, fromEl) {
    var fromRect = fromEl.getBoundingClientRect();
    var toRect = cardEl.getBoundingClientRect();
    var dx = fromRect.left - toRect.left;
    var dy = fromRect.top - toRect.top;

    var tl = gsap.timeline();
    // Start at deck position, move 60% of the way, then flip in the last 40%
    tl.set(cardEl, { x: dx, y: dy })
      .to(cardEl, { x: dx * 0.4, y: dy * 0.4, duration: 0.15, ease: 'power2.out' })
      .to(cardEl, { x: dx * 0.2, y: dy * 0.2, scaleX: 0, duration: 0.08, ease: 'power1.in' })
      .call(function () { showCardFront(cardEl); })
      .to(cardEl, { x: 0, y: 0, scaleX: 1, duration: 0.12, ease: 'power2.out' });
    return tl;
  },

  flipUp: function (cardEl) {
    var tl = gsap.timeline();
    tl.to(cardEl, { scaleX: 0, duration: 0.15, ease: 'power2.in' })
      .call(function () { showCardFront(cardEl); })
      .to(cardEl, { scaleX: 1, duration: 0.15, ease: 'power2.out' });
    return tl;
  },

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
    var destCX = destRect.left + destRect.width / 2;
    var destCY = destRect.top + destRect.height / 2;
    var tl = gsap.timeline();
    cardEls.forEach(function (el, i) {
      if (!el || !el.getBoundingClientRect) return;
      var elRect = el.getBoundingClientRect();
      var elCX = elRect.left + elRect.width / 2;
      var elCY = elRect.top + elRect.height / 2;
      tl.to(el, {
        x: '+=' + (destCX - elCX), y: '+=' + (destCY - elCY),
        scale: 0.7, opacity: 0, duration: 0.2, ease: 'power2.in',
        onComplete: function () { if (el.parentNode) el.remove(); },
      }, i * 0.04);
    });
    return tl;
  },

  cardClash: function (winnerEl, loserEl, winnerSide) {
    var winColor = winnerSide === 'player' ? '#2ecc71' : '#e74c3c';
    var winFront = winnerEl.querySelector('.card-front');
    var battleZone = document.getElementById('battle-zone');
    var tl = gsap.timeline();

    // Create slash element across the battle zone
    var slash = document.createElement('div');
    slash.className = 'battle-slash';
    battleZone.appendChild(slash);

    // Winner card on top
    tl.set(winnerEl, { zIndex: 20 })
    // 1. Slash flashes across
    .fromTo(slash, { opacity: 0, scaleX: 0 }, { opacity: 1, scaleX: 1, duration: 0.08, ease: 'power4.out' })
    // 2. Screen shake on battle zone
    .to(battleZone, { x: -4, duration: 0.04, ease: 'none' })
    .to(battleZone, { x: 5, duration: 0.04, ease: 'none' })
    .to(battleZone, { x: -3, duration: 0.04, ease: 'none' })
    .to(battleZone, { x: 0, duration: 0.04, ease: 'none' })
    // 3. Slash fades out
    .to(slash, { opacity: 0, duration: 0.15 }, '-=0.1')
    // 4. Winner grows + glows, loser shrinks + dims
    .to(winnerEl, { scale: 1.12, duration: 0.15, ease: 'power2.out' }, '-=0.1')
    .to(winFront, { boxShadow: '0 0 18px 5px ' + winColor, duration: 0.15 }, '<')
    .to(loserEl, { scale: 0.88, opacity: 0.45, duration: 0.15, ease: 'power2.out' }, '<')
    // 5. Brief hold, then cleanup
    .to({}, { duration: 0.15 })
    .call(function () { if (slash.parentNode) slash.remove(); });
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

// ===== STATUS BADGES =====

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
  this.cardElements = new Map();
  this.roundHadWar = false;
  this.autoWinActive = false;
  this.lastPlayerCount = 26;
  this.warState = null;
  this.warOpponentTimer = null;
  this.lastCompareEls = null;
  this.prevCombo = 0;

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
    gameoverStats: document.getElementById('gameover-stats'),
    activeUpgrades: document.getElementById('active-upgrades'),
    badgeTooltip: document.getElementById('badge-tooltip'),
    restartBtn: document.getElementById('restart-btn'),
    evalBarFill: document.getElementById('eval-bar-fill'),
    evalBar: document.getElementById('eval-bar'),
    comboDisplay: document.getElementById('combo-display'),
    upgradeConfirmBtn: document.getElementById('upgrade-confirm-btn'),
    deckFab: document.getElementById('deck-fab'),
    deckOverlay: document.getElementById('deck-overlay'),
    deckList: document.getElementById('deck-list'),
    deckCloseBtn: document.getElementById('deck-close-btn'),
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
  this.prevCombo = 0;
  if (this.warOpponentTimer) { this.warOpponentTimer.kill(); this.warOpponentTimer = null; }

  this.els.gameoverOverlay.classList.add('hidden');
  this.els.upgradeOverlay.classList.add('hidden');
  this.els.deckOverlay.classList.add('hidden');
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
  var tapHandler = function (e) { e.preventDefault(); self.onPlayerTap(); };
  this.els.playerDeckEl.addEventListener('click', tapHandler);
  this.els.playerDeckEl.addEventListener('touchend', tapHandler);
  this.els.restartBtn.addEventListener('click', function () { self.start(); });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  this.els.deckFab.addEventListener('click', function () { self.showDeckViewer(); });
  this.els.deckCloseBtn.addEventListener('click', function () { self.els.deckOverlay.classList.add('hidden'); });

  this.els.activeUpgrades.addEventListener('click', function (e) {
    var badge = e.target.closest('.upgrade-badge');
    if (badge && badge.dataset.desc) self.showBadgeTooltip(badge.dataset.desc);
  });
};

// --- Visual sync ---

GameUI.prototype.syncDecks = function () {
  this.playerDeckView.update(this.engine.getP1Count());
  this.opponentDeckView.update(this.engine.getP2Count());
  this.updateEvalBar();
};

GameUI.prototype.updateXPBar = function () {
  var progress = this.engine.getXPProgress();
  var pct = Math.min(100, progress.percentage);
  this.els.xpFill.style.height = pct + '%';
  this.els.xpLabel.textContent = progress.current + '/' + progress.needed;
};

GameUI.prototype.updateEvalBar = function () {
  var p1 = this.engine.getP1Count();
  var p2 = this.engine.getP2Count();
  var total = p1 + p2;
  if (total === 0) return;
  var advantage = (p1 - p2) / total;
  var sigmoid = 1 / (1 + Math.exp(-4 * advantage));
  this.els.evalBarFill.style.height = (sigmoid * 100) + '%';

  var delta = p1 - this.lastPlayerCount;
  if (delta !== 0 && this.lastPlayerCount !== undefined) this.showEvalPopup(delta);
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
  gsap.fromTo(popup, { opacity: 1, y: 0 },
    { opacity: 0, y: delta > 0 ? -20 : 20, duration: 1, ease: 'power2.out', onComplete: function () { popup.remove(); } });
};

GameUI.prototype.showXPPopup = function (amount) {
  var rect = this.els.xpContainer.getBoundingClientRect();
  var popup = document.createElement('div');
  popup.className = 'xp-popup';
  popup.textContent = '+' + amount + ' XP';
  document.body.appendChild(popup);
  popup.style.left = (rect.left - 8) + 'px';
  popup.style.top = (rect.top + rect.height / 2) + 'px';
  gsap.fromTo(popup, { opacity: 1, x: 0 },
    { opacity: 0, x: -30, duration: 1.2, ease: 'power2.out', onComplete: function () { popup.remove(); } });
};

GameUI.prototype.renderStatus = function () {
  renderStatusBadges(this.engine, this.els.activeUpgrades);
  this.updateCombo();
};

GameUI.prototype.updateCombo = function () {
  var combo = this.engine.combo;
  var el = this.els.comboDisplay;

  // Combo break animation
  if (this.prevCombo >= 2 && combo === 0) {
    gsap.to(el, {
      scale: 0.3, opacity: 0, x: '+=10', rotation: 15,
      duration: 0.4, ease: 'power2.in',
      onComplete: function () { el.classList.add('hidden'); gsap.set(el, { scale: 1, opacity: 1, x: 0, rotation: 0 }); }
    });
    this.prevCombo = combo;
    return;
  }

  if (combo >= 2) {
    el.textContent = 'x' + combo + ' COMBO';
    el.classList.remove('hidden');
    gsap.fromTo(el, { scale: 2, opacity: 0.5 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' });
    this.comboRing();
  } else {
    el.classList.add('hidden');
  }
  this.prevCombo = combo;
};

GameUI.prototype.comboRing = function () {
  var el = this.els.comboDisplay;
  var rect = el.getBoundingClientRect();
  var ring = document.createElement('div');
  ring.className = 'combo-ring';
  ring.style.left = (rect.left + rect.width / 2) + 'px';
  ring.style.top = (rect.top + rect.height / 2) + 'px';
  document.body.appendChild(ring);
  gsap.fromTo(ring, { scale: 0.5, opacity: 0.8 },
    { scale: 3, opacity: 0, duration: 0.6, ease: 'power2.out', onComplete: function () { ring.remove(); } });
};

GameUI.prototype.hideCombo = function () { this.els.comboDisplay.classList.add('hidden'); };

GameUI.prototype.makeCardEl = function (card) {
  var el = createCardElement(card);
  this.cardElements.set(card, el);
  return el;
};

GameUI.prototype.showBadgeTooltip = function (desc) {
  var tooltip = this.els.badgeTooltip;
  tooltip.textContent = desc;
  tooltip.classList.remove('hidden');
  clearTimeout(this._tooltipTimer);
  this._tooltipTimer = setTimeout(function () { tooltip.classList.add('hidden'); }, 2000);
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
  if (this.state === UI_STATES.WAITING_FOR_PLAYER) await this.playInitialCards();
  else if (this.state === UI_STATES.WAR_TAP) await this.playPlayerWarCard();
};

GameUI.prototype.playInitialCards = async function () {
  this.state = UI_STATES.ANIMATING;
  this.engine.stats.rounds++;

  var pCard = this.engine.drawPlayer();
  if (!pCard) { this.endGame('opponent'); return; }
  var pEl = this.makeCardEl(pCard);
  this.els.playerCards.appendChild(pEl);
  await Anim.playCardFaceUp(pEl, this.els.playerDeckEl);

  var oCard = this.engine.drawOpponent();
  if (!oCard) { this.endGame('player'); return; }
  var oEl = this.makeCardEl(oCard);
  this.els.opponentCards.appendChild(oEl);
  await Anim.playCardFaceUp(oEl, this.els.opponentDeckEl);

  this.syncDecks();

  // Show permanent boost badge using rankBoosts map
  var playerBoost = this.engine.rankBoosts[pCard.rank] || 0;
  if (playerBoost > 0) updateBoostBadge(pEl, playerBoost);
  await Anim.delay(0.15);

  var result = this.engine.evaluate(pCard, oCard);

  if (result.boosted) {
    updateBoostBadge(pEl, (playerBoost) + (result.playerEffective - pCard.baseValue - playerBoost));
    await Anim.delay(0.15);
  }

  this.lastCompareEls = { player: pEl, opponent: oEl };

  if (result.winner === 'tie') await this.resolveWar();
  else await this.resolveWin(result.winner);
};

// --- War flow ---

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

  if (ws.playerPlayed < 4) this.state = UI_STATES.WAR_TAP;
  this.checkWarComplete();
};

GameUI.prototype.scheduleOpponentWarCard = function () {
  var self = this;
  var delay = 0.2 + Math.random() * 0.15;
  this.warOpponentTimer = gsap.delayedCall(delay, function () { self.playOpponentWarCard(); });
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

  if (ws.opponentPlayed < 4) this.scheduleOpponentWarCard();
  this.checkWarComplete();
};

GameUI.prototype.checkWarComplete = async function () {
  var ws = this.warState;
  if (!ws || ws.playerPlayed < 4 || ws.opponentPlayed < 4 || ws.resolving) return;
  ws.resolving = true;
  this.state = UI_STATES.ANIMATING;

  var pEl = ws.playerEls[3], oEl = ws.opponentEls[3];
  var pCard = ws.playerCards[3], oCard = ws.opponentCards[3];

  await Promise.all([Anim.flipUp(pEl), Anim.flipUp(oEl)]);

  var playerBoost = this.engine.rankBoosts[pCard.rank] || 0;
  if (playerBoost > 0) updateBoostBadge(pEl, playerBoost);
  await Anim.delay(0.15);

  var result = this.engine.evaluate(pCard, oCard);
  if (result.boosted) {
    updateBoostBadge(pEl, result.playerEffective - pCard.baseValue);
    await Anim.delay(0.15);
  }

  this.lastCompareEls = { player: pEl, opponent: oEl };

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

  var compareEls = this.lastCompareEls;
  if (compareEls) {
    var winEl = winner === 'player' ? compareEls.player : compareEls.opponent;
    var loseEl = winner === 'player' ? compareEls.opponent : compareEls.player;
    await Anim.cardClash(winEl, loseEl, winner);
  }

  if (this.roundHadWar && winner === 'player') {
    await Anim.resultFlash('CRITICAL WIN!', '#f1c40f');
  }

  await Anim.flipAllFaceDown([this.els.playerCards, this.els.opponentCards]);
  await Anim.delay(0.25);

  var allEls = this.getAllVisibleCardEls();
  var destEl = winner === 'player' ? this.els.playerDeckEl : this.els.opponentDeckEl;
  if (allEls.length > 0) await Anim.collectCards(allEls, destEl);

  this.engine.collectToWinner(winner);

  if (winner === 'player') {
    this.engine.stats.wins++;
    var xpGain = this.engine.calcXP(this.roundHadWar);
    this.showXPPopup(xpGain);
    leveledUp = this.engine.addXP(xpGain);
    this.engine.combo++;
    if (this.engine.combo > this.engine.stats.maxCombo) this.engine.stats.maxCombo = this.engine.combo;
  } else {
    this.engine.stats.losses++;
    if (this.engine.lossXpPercent > 0) {
      var lossXp = Math.floor(this.engine.xpPerWin * this.engine.lossXpPercent / 100);
      if (lossXp > 0) { this.showXPPopup(lossXp); leveledUp = this.engine.addXP(lossXp); }
    }
    this.engine.combo = 0;
  }

  this.cardElements = new Map();
  this.roundHadWar = false;
  this.renderStatus();
  this.syncDecks();
  this.clearBattleZone();
  await this.checkUpgrade(leveledUp);
};

GameUI.prototype.resolveWar = async function () {
  this.roundHadWar = true;
  this.engine.stats.wars++;

  if (this.engine.autoWinWar) {
    this.autoWinActive = true;
    this.engine.autoWinWar = false;
    this.renderStatus();
  }

  await Anim.resultFlash('WAR!', '#f1c40f');

  if (!this.engine.canAffordWar()) {
    var winner = this.engine.forceWarLoss();
    this.syncDecks();
    this.endGame(winner);
    return;
  }

  if (this.warOpponentTimer) { this.warOpponentTimer.kill(); this.warOpponentTimer = null; }
  this.warState = {
    playerPlayed: 0, opponentPlayed: 0,
    playerCards: [], opponentCards: [],
    playerEls: [], opponentEls: [],
    resolving: false,
  };
  this.state = UI_STATES.WAR_TAP;
  this.scheduleOpponentWarCard();
};

// --- XP & Upgrades ---

GameUI.prototype.checkUpgrade = async function (leveledUp) {
  this.state = UI_STATES.CHECK_UPGRADE;
  this.updateXPBar();

  // Check game over BEFORE showing upgrade — don't interrupt a win
  var status = this.engine.isGameOver();
  if (status.over) { this.endGame(status.winner); return; }

  if (leveledUp) {
    this.els.xpContainer.classList.add('flash');
    var c = this.els.xpContainer;
    setTimeout(function () { c.classList.remove('flash'); }, 600);
    await Anim.delay(0.3);
    await this.showUpgradeChoice();
    this.updateXPBar();
  }

  status = this.engine.isGameOver();
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
    var selectedKey = null, selectedDiv = null;
    var confirmBtn = self.els.upgradeConfirmBtn;
    confirmBtn.disabled = true;
    confirmBtn.classList.add('btn--disabled');

    choices.forEach(function (ch) {
      var div = document.createElement('div');
      div.className = 'upgrade-card upgrade-card--' + ch.rarity;
      div.innerHTML = '<div class="upgrade-rarity-tag">' + ch.rarity.toUpperCase() + '</div>' +
        '<h3>' + ch.icon + ' ' + ch.name + '</h3><p>' + ch.desc + '</p>';
      div.addEventListener('click', function () {
        if (selectedDiv) selectedDiv.classList.remove('upgrade-card--selected');
        selectedDiv = div; selectedKey = ch.key;
        div.classList.add('upgrade-card--selected');
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('btn--disabled');
      });
      self.els.upgradeChoices.appendChild(div);
    });

    var handler = function () {
      if (!selectedKey) return;
      confirmBtn.removeEventListener('click', handler);
      var result = self.engine.activateUpgrade(selectedKey);
      self.renderStatus(); self.syncDecks();
      self.els.upgradeOverlay.classList.add('hidden');
      if (result && result.stolenCard) self.showStolenCard(result.stolenCard).then(resolve);
      else resolve();
    };
    confirmBtn.addEventListener('click', handler);
    self.els.upgradeOverlay.classList.remove('hidden');
  });
};

GameUI.prototype.showStolenCard = async function (card) {
  var cardEl = createCardElement(card);
  this.els.playerCards.appendChild(cardEl);
  showCardFront(cardEl);
  gsap.set(cardEl, { scale: 0 });
  await gsap.to(cardEl, { scale: 1.2, duration: 0.3, ease: 'back.out(2)' });
  await Anim.resultFlash('STOLEN!', '#3498db');
  await Anim.delay(0.5);
  await Anim.collectCards([cardEl], this.els.playerDeckEl);
  this.clearBattleZone();
  this.syncDecks();
};

// --- Deck Viewer ---

GameUI.prototype.showDeckViewer = function () {
  var ranks = WS.RANKS.slice().reverse(); // A down to 2
  var boosts = this.engine.rankBoosts;
  var list = this.els.deckList;
  list.innerHTML = '';

  for (var i = 0; i < ranks.length; i++) {
    var rank = ranks[i];
    var boost = boosts[rank] || 0;
    var row = document.createElement('div');
    row.className = 'deck-row';
    var boostClass = boost > 0 ? 'deck-row-boost--active' : 'deck-row-boost--zero';
    row.innerHTML = '<span class="deck-row-rank">' + rank + '</span>' +
      '<span class="deck-row-boost ' + boostClass + '">+' + boost + '</span>';
    list.appendChild(row);
  }
  this.els.deckOverlay.classList.remove('hidden');
};

// --- Game Over ---

GameUI.prototype.endGame = function (winner) {
  this.state = UI_STATES.GAME_OVER;
  this.els.gameoverMessage.textContent = winner === 'player' ? 'You Win!' : 'You Lose!';
  this.els.gameoverMessage.style.color = winner === 'player' ? '#2ecc71' : '#e74c3c';

  var s = this.engine.stats;
  var html = '';
  html += '<div class="stat-item"><span class="stat-value">' + s.rounds + '</span><span class="stat-label">Rounds</span></div>';
  html += '<div class="stat-item"><span class="stat-value">' + s.wins + '</span><span class="stat-label">Wins</span></div>';
  html += '<div class="stat-item"><span class="stat-value">' + s.losses + '</span><span class="stat-label">Losses</span></div>';
  html += '<div class="stat-item"><span class="stat-value">' + s.wars + '</span><span class="stat-label">Wars</span></div>';
  html += '<div class="stat-item"><span class="stat-value">' + s.maxCombo + '</span><span class="stat-label">Best Combo</span></div>';
  html += '<div class="stat-item"><span class="stat-value">' + s.upgradesPicked + '</span><span class="stat-label">Upgrades</span></div>';
  if (s.cardsStolen > 0) {
    html += '<div class="stat-item"><span class="stat-value">' + s.cardsStolen + '</span><span class="stat-label">Cards Stolen</span></div>';
  }
  var winRate = s.rounds > 0 ? Math.round((s.wins / s.rounds) * 100) : 0;
  html += '<div class="stat-item"><span class="stat-value">' + winRate + '%</span><span class="stat-label">Win Rate</span></div>';

  this.els.gameoverStats.innerHTML = html;
  this.els.gameoverOverlay.classList.remove('hidden');
};

// --- Helpers ---

GameUI.prototype.clearBattleZone = function () {
  this.els.playerCards.innerHTML = '';
  this.els.opponentCards.innerHTML = '';
};

GameUI.prototype.getAllVisibleCardEls = function () {
  var els = [];
  this.cardElements.forEach(function (el) { if (el && el.parentNode) els.push(el); });
  return els;
};

// ===== BOOT =====

document.addEventListener('DOMContentLoaded', function () {
  window.game = new GameUI();
});

// ===== CONSTANTS =====

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};
const SUIT_SYMBOLS = {
  hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660'
};

const States = Object.freeze({
  IDLE: 'IDLE',
  OPPONENT_PLAYS: 'OPPONENT_PLAYS',
  WAITING_FOR_PLAYER: 'WAITING_FOR_PLAYER',
  FLIP_PHASE: 'FLIP_PHASE',
  EVALUATE: 'EVALUATE',
  RESOLVE_WIN: 'RESOLVE_WIN',
  RESOLVE_WAR: 'RESOLVE_WAR',
  CHECK_UPGRADE: 'CHECK_UPGRADE',
  UPGRADE_CHOICE: 'UPGRADE_CHOICE',
  GAME_OVER: 'GAME_OVER',
});

const XP_PER_WIN = 20;
const XP_TO_LEVEL = 100;

// ===== CARD CLASS =====

class Card {
  constructor(suit, rank) {
    this.suit = suit;
    this.rank = rank;
    this.value = RANK_VALUES[rank];
    this.el = null;
  }

  createElement() {
    const div = document.createElement('div');
    div.className = 'card';
    div.dataset.suit = this.suit;
    div.dataset.rank = this.rank;
    div.dataset.value = this.value;

    const front = document.createElement('div');
    front.className = 'card-front';
    front.style.display = 'none';

    const rankTop = document.createElement('span');
    rankTop.className = 'rank';
    rankTop.textContent = this.rank;

    const suitCenter = document.createElement('span');
    suitCenter.className = 'suit';
    suitCenter.textContent = SUIT_SYMBOLS[this.suit];

    const rankBottom = document.createElement('span');
    rankBottom.className = 'rank-bottom';
    rankBottom.textContent = this.rank;

    front.appendChild(rankTop);
    front.appendChild(suitCenter);
    front.appendChild(rankBottom);

    const back = document.createElement('div');
    back.className = 'card-back';

    div.appendChild(front);
    div.appendChild(back);

    this.el = div;
    return div;
  }

  showFront() {
    if (!this.el) return;
    const front = this.el.querySelector('.card-front');
    const back = this.el.querySelector('.card-back');
    if (front) front.style.display = '';
    if (back) back.style.display = 'none';
  }

  showBack() {
    if (!this.el) return;
    const front = this.el.querySelector('.card-front');
    const back = this.el.querySelector('.card-back');
    if (front) front.style.display = 'none';
    if (back) back.style.display = '';
  }
}

// ===== DECK CLASS =====

class Deck {
  constructor(ownerEl) {
    this.cards = [];
    this.ownerEl = ownerEl;
    this.countEl = ownerEl.querySelector('.deck-count');
    this.stackEl = ownerEl.querySelector('.deck-stack');
  }

  get count() { return this.cards.length; }
  get isEmpty() { return this.cards.length === 0; }

  push(card) {
    this.cards.push(card);
    this.updateVisual();
  }

  pushMany(arr) {
    this.cards.push(...arr);
    this.updateVisual();
  }

  draw() {
    if (this.isEmpty) return null;
    const c = this.cards.shift();
    this.updateVisual();
    return c;
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
    this.updateVisual();
  }

  updateVisual() {
    this.countEl.textContent = this.cards.length;
    this.stackEl.innerHTML = '';

    if (this.isEmpty) {
      this.ownerEl.classList.add('empty');
      return;
    }

    this.ownerEl.classList.remove('empty');
    const depth = Math.min(3, this.cards.length);
    for (let i = 0; i < depth; i++) {
      const back = document.createElement('div');
      back.className = 'card-back';
      this.stackEl.appendChild(back);
    }
  }
}

function createStandardDeck() {
  const cards = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      cards.push(new Card(s, r));
    }
  }
  return cards;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ===== UPGRADE DEFINITIONS =====

const UPGRADES = {
  boost:      { name: '+2 Boost',     desc: 'Add +2 to your card value',                  duration: 3, durationType: 'rounds', icon: '\u2B06' },
  sabotage:   { name: '-2 Sabotage',  desc: "Subtract 2 from opponent's card value",       duration: 3, durationType: 'rounds', icon: '\u2B07' },
  doubleDown: { name: 'Double Down',  desc: 'Next war win, take 2 extra opponent cards',   duration: 1, durationType: 'war',    icon: '\u2694' },
  shield:     { name: 'Shield',       desc: 'Next round you lose, keep your card',         duration: 1, durationType: 'use',    icon: '\uD83D\uDEE1' },
  aceCrusher: { name: 'Ace Crusher',  desc: 'Your card beats Aces regardless',             duration: 2, durationType: 'rounds', icon: '\uD83D\uDC80' },
  rally:      { name: 'Rally',        desc: 'If behind (fewer cards), +3 to your value',   duration: 3, durationType: 'rounds', icon: '\uD83D\uDCE3' },
};

// ===== UPGRADE MANAGER =====

class UpgradeManager {
  constructor(badgeContainer) {
    this.active = [];
    this.badgeContainer = badgeContainer;
  }

  add(key) {
    const def = UPGRADES[key];
    this.active.push({ key, ...def, remaining: def.duration });
    this.renderBadges();
  }

  modifyValues(playerValue, opponentValue, opponentCard, playerBehind) {
    let pv = playerValue;
    let ov = opponentValue;
    let aceCrusherActive = false;

    for (const u of this.active) {
      switch (u.key) {
        case 'boost':
          pv += 2;
          break;
        case 'sabotage':
          ov -= 2;
          break;
        case 'aceCrusher':
          if (opponentCard.value === 14) aceCrusherActive = true;
          break;
        case 'rally':
          if (playerBehind) pv += 3;
          break;
      }
    }
    return { pv, ov, aceCrusherActive };
  }

  tickRounds() {
    this.active = this.active.filter(u => {
      if (u.durationType === 'rounds') {
        u.remaining--;
        return u.remaining > 0;
      }
      return true;
    });
    this.renderBadges();
  }

  consumeShield() {
    const idx = this.active.findIndex(u => u.key === 'shield');
    if (idx === -1) return false;
    this.active.splice(idx, 1);
    this.renderBadges();
    return true;
  }

  consumeDoubleDown() {
    const idx = this.active.findIndex(u => u.key === 'doubleDown');
    if (idx === -1) return false;
    this.active.splice(idx, 1);
    this.renderBadges();
    return true;
  }

  hasUpgrade(key) {
    return this.active.some(u => u.key === key);
  }

  getRandomChoices(n = 3) {
    const keys = shuffleArray(Object.keys(UPGRADES).slice());
    return keys.slice(0, n).map(k => ({ key: k, ...UPGRADES[k] }));
  }

  renderBadges() {
    this.badgeContainer.innerHTML = '';
    for (const u of this.active) {
      const span = document.createElement('span');
      span.className = 'upgrade-badge';
      span.textContent = `${u.icon} ${u.name} (${u.remaining})`;
      this.badgeContainer.appendChild(span);
    }
  }

  reset() {
    this.active = [];
    this.renderBadges();
  }
}

// ===== ANIMATION HELPERS =====

const Anim = {
  playCard(cardEl, fromEl, toEl) {
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const dx = fromRect.left - toRect.left;
    const dy = fromRect.top - toRect.top;

    return gsap.from(cardEl, {
      x: dx,
      y: dy,
      duration: 0.25,
      ease: 'power2.out',
    });
  },

  flipUp(cardEl, card) {
    const tl = gsap.timeline();
    tl.to(cardEl, { scaleX: 0, duration: 0.15, ease: 'power2.in' })
      .call(() => card.showFront())
      .to(cardEl, { scaleX: 1, duration: 0.15, ease: 'power2.out' });
    return tl;
  },

  flipDown(cardEl, card) {
    const tl = gsap.timeline();
    tl.to(cardEl, { scaleX: 0, duration: 0.15, ease: 'power2.in' })
      .call(() => card.showBack())
      .to(cardEl, { scaleX: 1, duration: 0.15, ease: 'power2.out' });
    return tl;
  },

  collectCards(cardEls, cards, destEl) {
    const destRect = destEl.getBoundingClientRect();
    const tl = gsap.timeline();

    cardEls.forEach((el, i) => {
      if (!el || !el.getBoundingClientRect) return;
      const elRect = el.getBoundingClientRect();
      const dx = destRect.left - elRect.left;
      const dy = destRect.top - elRect.top;

      if (cards[i]) {
        tl.call(() => cards[i].showBack(), null, i * 0.12);
      }
      tl.to(el, {
        x: dx,
        y: dy,
        scale: 0.7,
        opacity: 0,
        duration: 0.3,
        ease: 'power2.in',
        onComplete: () => { if (el.parentNode) el.remove(); },
      }, i * 0.12);
    });

    return tl;
  },

  warSlam(cardEl) {
    return gsap.from(cardEl, {
      y: -80,
      scale: 1.3,
      opacity: 0,
      duration: 0.25,
      ease: 'back.out(1.7)',
    });
  },

  resultFlash(text, color) {
    const el = document.getElementById('result-flash');
    el.textContent = text;
    el.style.color = color || '#fff';

    return gsap.timeline()
      .set(el, { opacity: 1, scale: 0.5 })
      .to(el, { scale: 1.2, duration: 0.2, ease: 'power2.out' })
      .to(el, { scale: 1, duration: 0.1 })
      .to(el, { opacity: 0, duration: 0.3, delay: 0.4 });
  },

  delay(seconds) {
    return new Promise(resolve => gsap.delayedCall(seconds, resolve));
  },
};

// ===== GAME CLASS =====

class Game {
  constructor() {
    this.state = States.IDLE;
    this.playerDeck = null;
    this.opponentDeck = null;
    this.upgrades = null;
    this.xp = 0;
    this.pot = [];

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

    this.upgrades = new UpgradeManager(this.els.activeUpgrades);
    this.bindEvents();
    this.start();
  }

  start() {
    this.state = States.IDLE;
    this.pot = [];
    this.xp = 0;

    this.els.gameoverOverlay.classList.add('hidden');
    this.els.upgradeOverlay.classList.add('hidden');
    this.clearBattleZone();

    const all = createStandardDeck();
    shuffleArray(all);

    const half = Math.floor(all.length / 2);
    this.playerDeck = new Deck(this.els.playerDeckEl);
    this.opponentDeck = new Deck(this.els.opponentDeckEl);

    all.slice(0, half).forEach(c => this.playerDeck.push(c));
    all.slice(half).forEach(c => this.opponentDeck.push(c));

    this.upgrades.reset();
    this.updateXPBar();
    this.beginRound();
  }

  bindEvents() {
    const tapHandler = (e) => {
      e.preventDefault();
      this.onPlayerTap();
    };
    this.els.playerDeckEl.addEventListener('click', tapHandler);
    this.els.playerDeckEl.addEventListener('touchend', tapHandler);

    this.els.restartBtn.addEventListener('click', () => this.start());

    document.addEventListener('contextmenu', e => e.preventDefault());
  }

  // --- State transitions ---

  async beginRound() {
    if (this.checkGameOver()) return;

    this.state = States.OPPONENT_PLAYS;
    this.pot = [];
    this.clearBattleZone();

    // Opponent auto-plays face-down
    const oppCard = this.opponentDeck.draw();
    if (!oppCard) { this.endGame('player'); return; }

    this.pot.push({ card: oppCard, owner: 'opponent' });
    const oppEl = oppCard.createElement();
    this.els.opponentBattle.appendChild(oppEl);
    await Anim.playCard(oppEl, this.els.opponentDeckEl, this.els.opponentBattle);

    // Wait for player
    this.state = States.WAITING_FOR_PLAYER;
    this.els.tapPrompt.classList.remove('hidden');
  }

  async onPlayerTap() {
    if (this.state !== States.WAITING_FOR_PLAYER) return;
    this.state = States.FLIP_PHASE; // lock immediately
    this.els.tapPrompt.classList.add('hidden');

    const pCard = this.playerDeck.draw();
    if (!pCard) { this.endGame('opponent'); return; }

    this.pot.push({ card: pCard, owner: 'player' });
    const pEl = pCard.createElement();
    this.els.playerBattle.appendChild(pEl);
    await Anim.playCard(pEl, this.els.playerDeckEl, this.els.playerBattle);

    await this.flipAndEvaluate();
  }

  async flipAndEvaluate() {
    this.state = States.FLIP_PHASE;

    // Find the last opponent and player entries in pot
    let oppEntry = null;
    let pEntry = null;
    for (let i = this.pot.length - 1; i >= 0; i--) {
      if (!pEntry && this.pot[i].owner === 'player') pEntry = this.pot[i];
      if (!oppEntry && this.pot[i].owner === 'opponent') oppEntry = this.pot[i];
      if (pEntry && oppEntry) break;
    }

    if (!oppEntry || !pEntry) return;

    // Flip both
    const oppEl = oppEntry.card.el;
    const pEl = pEntry.card.el;

    await Promise.all([
      Anim.flipUp(oppEl, oppEntry.card),
      Anim.flipUp(pEl, pEntry.card),
    ]);

    await Anim.delay(0.3);

    this.state = States.EVALUATE;

    // Apply upgrades
    const playerBehind = this.playerDeck.count < this.opponentDeck.count;
    const { pv, ov, aceCrusherActive } = this.upgrades.modifyValues(
      pEntry.card.value, oppEntry.card.value, oppEntry.card, playerBehind
    );

    let winner;
    if (aceCrusherActive && oppEntry.card.value === 14) {
      winner = 'player';
    } else if (pv > ov) {
      winner = 'player';
    } else if (ov > pv) {
      winner = 'opponent';
    } else {
      winner = 'tie';
    }

    if (winner === 'tie') {
      await this.resolveWar();
    } else {
      await this.resolveWin(winner);
    }
  }

  async resolveWin(winner) {
    this.state = States.RESOLVE_WIN;
    const loser = winner === 'player' ? 'opponent' : 'player';

    // Shield check
    if (loser === 'player' && this.upgrades.consumeShield()) {
      await Anim.resultFlash('SHIELDED!', '#3498db');

      // Player keeps their cards, opponent keeps theirs
      const playerCards = this.pot.filter(e => e.owner === 'player').map(e => e.card);
      const oppCards = this.pot.filter(e => e.owner === 'opponent').map(e => e.card);

      // Collect player cards back to player
      const playerEls = playerCards.map(c => c.el).filter(Boolean);
      if (playerEls.length > 0) {
        await Anim.collectCards(playerEls, playerCards, this.els.playerDeckEl);
      }
      playerCards.forEach(c => { c.el = null; this.playerDeck.push(c); });

      // Collect opponent cards back to opponent
      const oppEls = oppCards.map(c => c.el).filter(Boolean);
      if (oppEls.length > 0) {
        await Anim.collectCards(oppEls, oppCards, this.els.opponentDeckEl);
      }
      oppCards.forEach(c => { c.el = null; this.opponentDeck.push(c); });
    } else {
      // Normal win
      const label = winner === 'player' ? 'YOU WIN!' : 'YOU LOSE';
      const color = winner === 'player' ? '#2ecc71' : '#e74c3c';
      await Anim.resultFlash(label, color);

      const allCards = this.pot.map(e => e.card);
      const destDeck = winner === 'player' ? this.playerDeck : this.opponentDeck;
      const destEl = winner === 'player' ? this.els.playerDeckEl : this.els.opponentDeckEl;

      // Collect animation
      const allEls = allCards.map(c => c.el).filter(Boolean);
      if (allEls.length > 0) {
        await Anim.collectCards(allEls, allCards, destEl);
      }

      // Shuffle before adding to prevent patterns
      shuffleArray(allCards);
      allCards.forEach(c => { c.el = null; destDeck.push(c); });

      // XP for player wins
      if (winner === 'player') {
        this.xp += XP_PER_WIN;
      }

      // Double Down: extra cards on war win (handled in resolveWar before calling this)
    }

    this.upgrades.tickRounds();
    this.clearBattleZone();
    await this.checkUpgrade();
  }

  async resolveWar() {
    this.state = States.RESOLVE_WAR;
    await Anim.resultFlash('WAR!', '#f1c40f');

    // Check both have enough cards (need at least 4: 3 face-down + 1 reveal)
    const needed = 4;
    if (this.playerDeck.count < needed) { this.endGame('opponent'); return; }
    if (this.opponentDeck.count < needed) { this.endGame('player'); return; }

    // Slam 3 face-down per side
    for (let i = 0; i < 3; i++) {
      const oc = this.opponentDeck.draw();
      this.pot.push({ card: oc, owner: 'opponent' });
      const oEl = oc.createElement();
      this.els.warPileOpponent.appendChild(oEl);
      await Anim.warSlam(oEl);

      const pc = this.playerDeck.draw();
      this.pot.push({ card: pc, owner: 'player' });
      const pEl = pc.createElement();
      this.els.warPilePlayer.appendChild(pEl);
      await Anim.warSlam(pEl);
    }

    await Anim.delay(0.2);

    // Play reveal cards into battle slots
    // Clear current battle cards first
    this.els.opponentBattle.innerHTML = '';
    this.els.playerBattle.innerHTML = '';

    const oppReveal = this.opponentDeck.draw();
    this.pot.push({ card: oppReveal, owner: 'opponent' });
    const oppEl = oppReveal.createElement();
    this.els.opponentBattle.appendChild(oppEl);
    await Anim.playCard(oppEl, this.els.opponentDeckEl, this.els.opponentBattle);

    const pReveal = this.playerDeck.draw();
    this.pot.push({ card: pReveal, owner: 'player' });
    const pEl = pReveal.createElement();
    this.els.playerBattle.appendChild(pEl);
    await Anim.playCard(pEl, this.els.playerDeckEl, this.els.playerBattle);

    // Evaluate (recursion handles additional ties)
    await this.flipAndEvaluate();
  }

  // --- XP & Upgrades ---

  updateXPBar() {
    const pct = Math.min(100, (this.xp / XP_TO_LEVEL) * 100);
    this.els.xpFill.style.width = pct + '%';
    this.els.xpLabel.textContent = `XP: ${this.xp} / ${XP_TO_LEVEL}`;
  }

  async checkUpgrade() {
    this.state = States.CHECK_UPGRADE;
    this.updateXPBar();

    if (this.xp >= XP_TO_LEVEL) {
      this.xp -= XP_TO_LEVEL;
      this.updateXPBar();

      // Flash XP bar
      this.els.xpContainer.classList.add('flash');
      setTimeout(() => this.els.xpContainer.classList.remove('flash'), 600);

      await Anim.delay(0.3);
      await this.showUpgradeChoice();
    }

    if (this.checkGameOver()) return;

    this.state = States.IDLE;
    this.beginRound();
  }

  showUpgradeChoice() {
    return new Promise(resolve => {
      this.state = States.UPGRADE_CHOICE;
      const choices = this.upgrades.getRandomChoices(3);
      this.els.upgradeChoices.innerHTML = '';

      choices.forEach(ch => {
        const div = document.createElement('div');
        div.className = 'upgrade-card';
        div.innerHTML = `<h3>${ch.icon} ${ch.name}</h3><p>${ch.desc} <span style="opacity:0.5">(${ch.duration} ${ch.durationType})</span></p>`;
        div.addEventListener('click', () => {
          this.upgrades.add(ch.key);
          this.els.upgradeOverlay.classList.add('hidden');
          resolve();
        });
        this.els.upgradeChoices.appendChild(div);
      });

      this.els.upgradeOverlay.classList.remove('hidden');
    });
  }

  // --- Game Over ---

  checkGameOver() {
    if (this.opponentDeck.isEmpty) { this.endGame('player'); return true; }
    if (this.playerDeck.isEmpty) { this.endGame('opponent'); return true; }
    return false;
  }

  endGame(winner) {
    this.state = States.GAME_OVER;
    this.els.tapPrompt.classList.add('hidden');
    this.els.gameoverMessage.textContent = winner === 'player' ? 'You Win!' : 'You Lose!';
    this.els.gameoverMessage.style.color = winner === 'player' ? '#2ecc71' : '#e74c3c';
    this.els.gameoverOverlay.classList.remove('hidden');
  }

  clearBattleZone() {
    this.els.opponentBattle.innerHTML = '';
    this.els.playerBattle.innerHTML = '';
    this.els.warPileOpponent.innerHTML = '';
    this.els.warPilePlayer.innerHTML = '';
  }
}

// ===== BOOT =====

document.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});

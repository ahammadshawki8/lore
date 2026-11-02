import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const LETTERS = ['A', 'B', 'C', 'D'];

async function loadLeaderboard(file) {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function saveLeaderboard(leaderboard, file) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(leaderboard, null, 2)}\n`, 'utf8');
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function plausibleDecoys(lore, used) {
  const seed = String(lore.phrase || lore.title || 'Mystery').replace(/^the\s+/i, '');
  const topic = seed.charAt(0).toUpperCase() + seed.slice(1);
  const candidates = [
    `The ${topic} Paradox`,
    `Ballad of the ${topic}`,
    `The ${topic} Conspiracy`,
    `Chronicles of ${topic}`,
    `The Last ${topic} of Stream`,
  ];
  return candidates.filter((title) => !used.has(title));
}

function hasModeratorBadge(message) {
  return (message.badges ?? []).some((badge) => {
    const badgeName = `${badge.set_id ?? ''} ${badge.id ?? ''}`.toLowerCase();
    return badgeName.includes('moderator') || badgeName.includes('broadcaster');
  });
}

export async function startTrials({
  chatEvents,
  broadcast,
  sendChat,
  getUsers,
  getLore,
  getRitualState = () => ({ phase: 'IDLE' }),
  leaderboardPath = 'data/loremasters.json',
  trialSeconds = 20,
  random = Math.random,
  now = Date.now,
}) {
  let leaderboard = await loadLeaderboard(leaderboardPath);
  let active = null;

  function allowed(message) {
    return hasModeratorBadge(message) || String(message.login ?? '').toLowerCase().startsWith('streamer');
  }

  async function chatterAvatar(user) {
    if (user.avatar || !getUsers) return user.avatar ?? null;
    try {
      const profiles = await getUsers([user.login]);
      return profiles?.[user.login] ?? null;
    } catch (error) {
      console.warn(`[trials] Could not load chatter avatar: ${error.message}`);
      return null;
    }
  }

  function tally() {
    const counts = [0, 0, 0, 0];
    for (const answer of active?.answers.values() ?? []) counts[answer.index] += 1;
    return counts;
  }

  function sendTally() {
    if (active) broadcast('trial_tally', { counts: tally() });
  }

  async function endTrial() {
    const trial = active;
    if (!trial || trial.finishing) return;
    trial.finishing = true;
    clearTimeout(trial.timeout);
    clearInterval(trial.interval);
    const correctAnswers = [...trial.answers.values()].filter((answer) => answer.index === trial.correctIndex)
      .sort((a, b) => a.answeredAt - b.answeredAt);
    const correctUsers = [];
    const awards = [];
    for (const answer of correctAnswers) {
      const avatar = await chatterAvatar(answer);
      if (active !== trial || trial.cancelled) return;
      const elapsed = Math.max(0, answer.answeredAt - trial.startedAt);
      const speedBonus = Math.round(50 * Math.max(0, Math.min(1, 1 - elapsed / (trialSeconds * 1000))));
      const points = 100 + speedBonus;
      const user = {
        login: answer.login,
        display_name: answer.display_name,
        avatar,
      };
      correctUsers.push(user);
      awards.push({ answer, user, points });
    }
    if (active !== trial || trial.cancelled) return;
    for (const { answer, user, points } of awards) {
      const existing = leaderboard.find((item) => item.login.toLowerCase() === answer.login.toLowerCase());
      if (existing) {
        existing.display_name = answer.display_name;
        existing.avatar = user.avatar ?? existing.avatar ?? null;
        existing.score = (existing.score ?? 0) + points;
        existing.wins = (existing.wins ?? 0) + 1;
      } else {
        leaderboard.push({ ...user, score: points, wins: 1 });
      }
      answer.points = points;
    }
    leaderboard.sort((a, b) => b.score - a.score || b.wins - a.wins || a.login.localeCompare(b.login));
    if (active !== trial || trial.cancelled) return;
    await saveLeaderboard(leaderboard, leaderboardPath);
    if (active !== trial || trial.cancelled) return;
    const topFive = await Promise.all(leaderboard.slice(0, 5).map(async (user) => ({
      ...user,
      avatar: await chatterAvatar(user),
    })));
    if (active !== trial || trial.cancelled) return;
    broadcast('trial_result', {
      correctIndex: trial.correctIndex,
      correctUsers,
      leaderboard: topFive,
    });
    const winner = correctAnswers[0];
    try {
      await sendChat(winner
        ? `@${winner.login} is the Loremaster! They earned ${winner.points} points.`
        : 'No correct answers this round. The lore remains mysterious!');
    } catch (error) {
      console.error(`[trials] Could not send trial result: ${error.message}`);
    }
    if (active === trial) active = null;
  }

  function startTrial(message) {
    if (active) {
      void sendChat(`@${message.login} a Lore Trial is already underway.`).catch((error) => console.error(`[trials] ${error.message}`));
      return;
    }
    if (getRitualState().phase !== 'IDLE') {
      void sendChat(`@${message.login} the Lore Trial must wait until the ritual is complete.`).catch((error) => console.error(`[trials] ${error.message}`));
      return;
    }
    if (!allowed(message)) {
      void sendChat(`@${message.login} only the broadcaster or a moderator may open a Lore Trial.`).catch((error) => console.error(`[trials] ${error.message}`));
      return;
    }
    const loreEntries = getLore();
    if (!loreEntries.length) {
      void sendChat('There is no canonized lore to quiz chat about yet.').catch((error) => console.error(`[trials] ${error.message}`));
      return;
    }
    const chosenLore = loreEntries[Math.floor(random() * loreEntries.length)];
    const decoys = loreEntries.filter((entry) => entry.id !== chosenLore.id).map((entry) => entry.title);
    const used = new Set([chosenLore.title]);
    const options = [];
    for (const title of shuffle(decoys, random)) {
      if (!used.has(title)) {
        options.push(title);
        used.add(title);
      }
      if (options.length === 3) break;
    }
    for (const title of shuffle(plausibleDecoys(chosenLore, used), random)) {
      if (options.length === 3) break;
      if (!used.has(title)) {
        options.push(title);
        used.add(title);
      }
    }
    const correctIndex = Math.floor(random() * 4);
    options.splice(correctIndex, 0, chosenLore.title);
    const question = chosenLore.trial?.question || `Which lore was born when: ${chosenLore.story}?`;
    const startedAt = now();
    const endsAt = new Date(startedAt + trialSeconds * 1000).toISOString();
    active = {
      answers: new Map(),
      correctIndex,
      startedAt,
      finishing: false,
      openedBy: message.login,
      interval: null,
      timeout: null,
    };
    broadcast('trial_open', {
      question,
      options: options.map((title, index) => ({ letter: LETTERS[index], title })),
      endsAt,
    });
    const prompt = `Lore Trial: ${question} ${options.map((title, index) => `${LETTERS[index]}) ${title}`).join(' | ')} Reply A, B, C, or D!`;
    void sendChat(prompt).catch((error) => console.error(`[trials] Could not send trial question: ${error.message}`));
    active.interval = setInterval(sendTally, 500);
    active.timeout = setTimeout(() => void endTrial(), trialSeconds * 1000);
  }

  function onMessage(message) {
    if (message.text === '!trial') {
      startTrial(message);
      return;
    }
    if (!active || active.finishing || message.text.length !== 1) return;
    const index = LETTERS.indexOf(message.text.toUpperCase());
    if (index === -1 || active.answers.has(message.login.toLowerCase())) return;
    active.answers.set(message.login.toLowerCase(), {
      index,
      login: message.login,
      display_name: message.display_name || message.login,
      avatar: message.avatar ?? null,
      answeredAt: now(),
    });
  }

  chatEvents.on('message', onMessage);
  return {
    getLeaderboard: () => leaderboard,
    getState: () => ({ active: Boolean(active) }),
    cancelForRitual() {
      if (!active) return;
      clearTimeout(active.timeout);
      clearInterval(active.interval);
      active.cancelled = true;
      active = null;
      void sendChat('The Lore Trial has been postponed while a ritual is underway.').catch((error) => console.error(`[trials] ${error.message}`));
    },
    stop() {
      chatEvents.off('message', onMessage);
      if (active) {
        clearTimeout(active.timeout);
        clearInterval(active.interval);
      }
      active = null;
    },
  };
}

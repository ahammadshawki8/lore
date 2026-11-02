import { randomUUID } from 'node:crypto';
import { draft } from './lorekeeper.js';
import { loadLore, saveLore } from './storage.js';

const DEFAULT_CONFIG = { summonThreshold: 3, summonSeconds: 20, voteSeconds: 20, trialSeconds: 20 };

export async function startRitualEngine({
  chatEvents,
  broadcast,
  sendChat,
  createClip,
  getUsers,
  getStream,
  streamer = null,
  loreDraft = draft,
  dataPath = 'data/lore.json',
  config: initialConfig = {},
  onPhaseChange = () => {},
}) {
  const config = { ...DEFAULT_CONFIG, ...initialConfig };
  let entries = await loadLore(dataPath);
  let phase = 'IDLE';
  let summoners = [];
  let votes = new Map();
  let titles = [];
  let draftResult;
  let clip = null;
  let summonTimer;
  let voteTimer;
  let tallyTimer;
  let canonTimer;
  let summonEndsAt;
  const queue = [];
  const recentMessages = [];
  const avatarCache = new Map();

  function summarizeUsers(users) {
    return users.map(({ login, display_name, avatar }) => ({ login, display_name, avatar: avatar ?? avatarCache.get(login) ?? null }));
  }

  async function hydrateAvatars(users) {
    const unknown = users.filter((user) => !user.avatar && !avatarCache.has(user.login));
    if (unknown.length && getUsers) {
      try {
        const profiles = await getUsers(unknown.map((user) => user.login));
        for (const user of unknown) avatarCache.set(user.login, profiles?.[user.login] ?? null);
      } catch (error) {
        console.warn(`[ritual] Could not load chatter avatars: ${error.message}`);
      }
    }
    return summarizeUsers(users);
  }

  function getConfig() {
    return { ...config };
  }

  function updateConfig(changes = {}) {
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      if (changes[key] !== undefined) {
        const value = Number(changes[key]);
        if (!Number.isFinite(value) || value <= 0) throw new Error(`${key} must be a positive number`);
        config[key] = value;
      }
    }
    return getConfig();
  }

  function setPhase(next) {
    phase = next;
    onPhaseChange({ phase });
  }

  function broadcastSummon() {
    if (phase !== 'SUMMONING') return;
    const currentSummoners = [...summoners];
    broadcast('summon', {
      joiners: summarizeUsers(currentSummoners),
      needed: Math.max(0, config.summonThreshold - summoners.length),
      endsAt: summonEndsAt,
    });
    void hydrateAvatars(currentSummoners).then((joiners) => {
      if (phase !== 'SUMMONING') return;
      broadcast('summon', {
        joiners,
        needed: Math.max(0, config.summonThreshold - summoners.length),
        endsAt: summonEndsAt,
      });
    });
  }

  function addSummoner(message) {
    if (summoners.some((user) => user.login === message.login)) return;
    summoners.push({
      login: message.login,
      display_name: message.display_name || message.login,
      avatar: message.avatar || null,
    });
    broadcastSummon();
    if (summoners.length >= config.summonThreshold) {
      clearTimeout(summonTimer);
      void beginDeciphering();
    }
  }

  function startSummon(message) {
    if (phase !== 'IDLE') return false;
    setPhase('SUMMONING');
    summoners = [];
    summonEndsAt = new Date(Date.now() + config.summonSeconds * 1000).toISOString();
    addSummoner(message);
    if (phase !== 'SUMMONING') return true;
    summonTimer = setTimeout(() => {
      if (phase !== 'SUMMONING') return;
      broadcast('fizzle', { joiners: summarizeUsers(summoners) });
      finishRitual();
    }, config.summonSeconds * 1000);
    return true;
  }

  async function beginDeciphering() {
    if (phase !== 'SUMMONING') return;
    setPhase('DECIPHERING');
    const summonerSnapshot = [...summoners];
    const messageSnapshot = recentMessages.slice(-40);
    const witnesses = summarizeUsers(summonerSnapshot);
    broadcast('decipher', { summoners: witnesses });
    const context = {
      messages: messageSnapshot,
      stream: null,
      streamer: typeof streamer === 'function' ? streamer() : streamer,
      login: typeof streamer === 'function' ? streamer() : streamer,
      summoners: witnesses,
    };
    try {
      context.stream = await getStream();
      const [createdClip, result] = await Promise.all([createClip(), loreDraft(context)]);
      clip = createdClip;
      draftResult = result;
      if (phase !== 'DECIPHERING') return;
      if (!Array.isArray(draftResult.titles) || draftResult.titles.length !== 3) {
        throw new Error('Lore draft must include exactly three titles');
      }
      titles = draftResult.titles;
      votes = new Map();
      setPhase('VOTING');
      const endsAt = new Date(Date.now() + config.voteSeconds * 1000).toISOString();
      broadcast('vote_open', { titles, endsAt });
      tallyTimer = setInterval(sendTally, 500);
      voteTimer = setTimeout(() => void finishVoting(), config.voteSeconds * 1000);
    } catch (error) {
      console.error(`[ritual] Deciphering failed: ${error.message}`);
      broadcast('fizzle', { reason: 'decipher_failed' });
      finishRitual();
    }
  }

  function getVoteUsers() {
    const voters = [...votes.keys()].map((login) => {
      const user = [...recentMessages].reverse().find((message) => message.login === login);
      return {
        login,
        display_name: user?.display_name || login,
        avatar: user?.avatar || avatarCache.get(login) || null,
      };
    });
    return voters;
  }

  function sendTally() {
    const counts = [0, 0, 0];
    for (const index of votes.values()) counts[index] += 1;
    broadcast('vote_tally', { counts, voters: summarizeUsers(getVoteUsers()) });
  }

  async function finishVoting() {
    if (phase !== 'VOTING') return;
    clearTimeout(voteTimer);
    clearInterval(tallyTimer);
    sendTally();
    const counts = [0, 0, 0];
    for (const index of votes.values()) counts[index] += 1;
    const winner = counts.reduce((best, count, index) => count > counts[best] ? index : best, 0);
    const title = titles[winner];
    try {
      await sendChat(`The people have chosen: ${title}!`);
      await canonize(title);
    } catch (error) {
      console.error(`[ritual] Could not canonize the result: ${error.message}`);
      broadcast('fizzle', { reason: 'canonization_failed' });
      finishRitual();
    }
  }

  async function canonize(title) {
    setPhase('CANONIZED');
    const [initiators, voters] = await Promise.all([hydrateAvatars(summoners), hydrateAvatars(getVoteUsers())]);
    const combined = [...initiators, ...voters];
    const unique = [...new Map(combined.map((user) => [user.login, user])).values()].slice(0, 12);
    const n = entries.reduce((max, entry) => Math.max(max, Number(entry.n) || 0), 0) + 1;
    const entry = {
      id: randomUUID(),
      n,
      title,
      story: draftResult.story,
      explainer: draftResult.explainer,
      sigil: draftResult.sigil,
      phrase: draftResult.phrase,
      clip,
      witnesses: unique,
      born_at: new Date().toISOString(),
      uses: 0,
      initiates: 0,
      trial: draftResult.trial,
    };
    entries.push(entry);
    await saveLore(entries, dataPath);
    broadcast('canonized', entry);
    try {
      const clipUrl = clip?.url ?? '';
      await sendChat(`\u{1F4DC} LORE #${n} CANONIZED: ${title} - ${clipUrl}`);
    } catch (error) {
      console.error(`[ritual] Lore was saved, but the canon announcement failed: ${error.message}`);
    }
    canonTimer = setTimeout(finishRitual, 3000);
  }

  function finishRitual() {
    clearTimeout(summonTimer);
    clearTimeout(voteTimer);
    clearInterval(tallyTimer);
    clearTimeout(canonTimer);
    setPhase('IDLE');
    summoners = [];
    votes = new Map();
    titles = [];
    draftResult = undefined;
    clip = null;
    drainQueue();
  }

  function drainQueue() {
    while (phase === 'IDLE' && queue.length) {
      const message = queue.shift();
      if (startSummon(message)) {
        while (phase === 'SUMMONING' && queue.length) addSummoner(queue.shift());
        break;
      }
    }
  }

  function onMessage(message) {
    recentMessages.push(message);
    if (recentMessages.length > 40) recentMessages.shift();
    if (message.text === '!lore') {
      if (phase === 'IDLE') startSummon(message);
      else if (phase === 'SUMMONING') addSummoner(message);
      else queue.push(message);
      return;
    }
    if (phase === 'VOTING' && ['1', '2', '3'].includes(message.text)) {
      votes.set(message.login, Number(message.text) - 1);
    }
  }

  chatEvents.on('message', onMessage);
  return {
    getConfig,
    updateConfig,
    getLore: () => entries,
    async deleteLore(id) {
      const index = entries.findIndex((entry) => String(entry.id) === String(id));
      if (index < 0) return false;
      const [removed] = entries.splice(index, 1);
      await saveLore(entries, dataPath);
      broadcast('lore_deleted', { id: removed.id });
      return true;
    },
    getState: () => ({ phase, queued: queue.length }),
    stop() {
      chatEvents.off('message', onMessage);
      clearTimeout(summonTimer);
      clearTimeout(voteTimer);
      clearInterval(tallyTimer);
      clearTimeout(canonTimer);
    },
  };
}

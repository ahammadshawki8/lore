export function createRaidHandler({ sendChat, broadcast, getUsers, getLore }) {
  return async function handleRaid(raid = {}) {
    const source = raid.from ?? {};
    const login = String(source.login || '').trim().toLowerCase();
    const displayName = String(source.display_name || source.displayName || login || 'Another channel').trim();
    let avatar = source.avatar || null;
    if (!avatar && login) {
      try {
        avatar = (await getUsers([login]))?.[login] || null;
      } catch (error) {
        console.warn(`[raid] Could not load raider avatar: ${error.message}`);
      }
    }

    try {
      await sendChat(`Welcome raiders from ${displayName}! New here? Type !lore to learn our legends.`);
    } catch (error) {
      console.warn(`[raid] Could not send raid welcome: ${error.message}`);
    }

    let entries = [];
    try {
      const lore = await getLore();
      entries = Array.isArray(lore) ? lore : [];
    } catch (error) {
      console.warn(`[raid] Could not load the lore archive: ${error.message}`);
    }
    const top = [...entries]
      .sort((first, second) => (Number(second.uses) || 0) - (Number(first.uses) || 0))
      .slice(0, 3);
    broadcast('raid', {
      from: { login, display_name: displayName, avatar },
      viewers: Math.max(0, Number(raid.viewers) || 0),
      top,
    });
  };
}

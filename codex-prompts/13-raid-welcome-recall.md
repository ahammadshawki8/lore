Two Twitch-native features that make LORE feel alive. Follow the broadcast layout zones
(right panel, lower third, small chips; nothing over the center except short callouts).

1. RAID WELCOME (raiders are the biggest newcomer wave on Twitch):
   - Subscribe to EventSub channel.raid (version 1, condition to_broadcaster_user_id = our
     user). No extra scope is needed. On a raid: sendChat("Welcome raiders from
     <from_broadcaster_user_name>! New here? Type !lore to learn our legends.") and
     broadcast('raid', { from: {login, display_name, avatar}, viewers, top: [3 most-used
     lore entries] }).
   - Overlay: a "RAID INCOMING" banner slides into the lower third with the raider's avatar,
     name and viewer count, then a right-panel "WELCOME TO OUR LORE" carousel that deals the
     top 3 lore cards one by one (mini cards: sigil, title, one-line explainer), 10s total.
   - Control panel: a "Simulate raid" button (POST /api/simulate/raid { from, viewers }).
   - ?scene=raid preview.
2. LORE RECALL (lore stays alive):
   - When a canonized phrase is used by 3+ distinct chatters within 30s, broadcast('recall',
     { lore, uses }) (cooldown 60s per lore) and increment uses.
   - Overlay: a compact chip under the top-right corner chip: sigil + "LORE RECALLED" +
     title + "used 24x", with a gold shimmer sweep, 5s.
   - ?scene=recall preview.
3. Add both to the ?demo=1 loop and to scripts/smoke.js (offline, with stubs).

No em dashes. node --check, run npm run smoke, verify ids. Summarize.

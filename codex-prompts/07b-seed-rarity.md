The archive looks great now. Two quick fixes:

1. scripts/seed.js entries have no witnesses, so every card is Common, shows "WITNESSES 0",
   the Legendary stat is 0, and "Oldest living joke" says "No living joke yet". Give the 5
   seed entries realistic witnesses arrays (login, display_name, dicebear avatar
   https://api.dicebear.com/9.x/bottts/svg?seed=<login>) with counts that produce one of each
   rarity plus one more: 12 (Legendary), 8 (Epic), 5 (Rare), 5 (Rare), 2 (Common). Make 3 of
   them "living" (a last_used_at within the last 2 days and higher uses). Make sure the
   archive's living/oldest logic reads those fields. Then run `node scripts/seed.js --force`.
2. The starmap panel has a large empty area below the orbs. Reduce its height to fit the
   orbs (about 360px) or spread the orbs vertically to use the space.

No em dashes. node --check, summarize.

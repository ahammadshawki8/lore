import { mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { writeJsonAtomic } from '../src/storage.js';

const dataDirectory = resolve('data');
const force = process.argv.includes('--force');
const now = Date.now();
const daysAgo = (days) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
const avatar = (login) => `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(login)}`;

const lore = [
  {
    id: 'seed-bucket', n: 1, title: 'The Bucket That Knew Too Much', phrase: 'the bucket', sigil: '🪣',
    story: 'At the edge of a quiet run, the streamer lifted an ordinary bucket and chat declared it an artifact of impossible power. It appeared again whenever fortune turned, until even the oldest lurkers treated its arrival as prophecy.',
    explainer: 'Chat calls the mysteriously well timed bucket a good luck charm.', clip: null, born_at: daysAgo(2), uses: 38, initiates: 7,
    witnesses: [], trial: { question: 'Which title was given to chat’s mysterious good luck charm?' },
  },
  {
    id: 'seed-real', n: 2, title: 'The Great Reality Audit', phrase: 'chat is this real', sigil: '🔎',
    story: 'When the impossible happened on screen, the streamer stopped mid sentence to inspect the evidence. Chat began asking whether any of it was real, and the question became the community’s official response to every unlikely triumph.',
    explainer: 'The phrase marks the channel’s most unbelievable surprises.', clip: null, born_at: daysAgo(6), uses: 24, initiates: 5,
    witnesses: [], trial: { question: 'What question does chat ask when something unbelievable happens?' },
  },
  {
    id: 'seed-ladder', n: 3, title: 'The Ladder of Unwise Ambition', phrase: 'ladder', sigil: '🪜',
    story: 'The streamer found a ladder and trusted it far more than the laws of physics recommended. Chat watched each careful step become a magnificent detour, then preserved the climb as a warning against suspiciously convenient stairs.',
    explainer: 'The ladder recalls a daring climb that went wonderfully off plan.', clip: null, born_at: daysAgo(10), uses: 17, initiates: 4,
    witnesses: [], trial: { question: 'Which object launched the streamer’s ill advised climb?' },
  },
  {
    id: 'seed-crab', n: 4, title: 'The Crab’s Brief Reign', phrase: 'tiny crab', sigil: '🦀',
    story: 'A tiny crab crossed the streamer’s path and seized the attention of the entire channel. For one brief scene it ruled the screen, while chat supplied the royal procession and refused to recognize any other authority.',
    explainer: 'The tiny crab became an unlikely ruler during a memorable stream interruption.', clip: null, born_at: daysAgo(15), uses: 13, initiates: 3,
    witnesses: [], trial: { question: 'Which small creature briefly ruled the stream?' },
  },
  {
    id: 'seed-door', n: 5, title: 'The Door of Excellent Timing', phrase: 'wrong door', sigil: '🚪',
    story: 'The streamer chose the wrong door with the confidence of a seasoned explorer. What waited beyond it sent the room into delighted chaos, and the community still invokes that doorway whenever a plan takes a sudden turn.',
    explainer: 'The wrong door is shorthand for a bold choice with surprising consequences.', clip: null, born_at: daysAgo(20), uses: 9, initiates: 2,
    witnesses: [], trial: { question: 'What did the streamer choose with unforgettable confidence?' },
  },
];

const loremasters = [
  { login: 'maple_mage', display_name: 'Maple Mage', avatar: avatar('maple_mage'), score: 860, wins: 6 },
  { login: 'bucketbard', display_name: 'Bucket Bard', avatar: avatar('bucketbard'), score: 720, wins: 5 },
  { login: 'ladderknight', display_name: 'Ladder Knight', avatar: avatar('ladderknight'), score: 610, wins: 4 },
  { login: 'crabwise', display_name: 'Crabwise', avatar: avatar('crabwise'), score: 490, wins: 4 },
  { login: 'real_or_rune', display_name: 'Real or Rune', avatar: avatar('real_or_rune'), score: 350, wins: 3 },
  { login: 'doorprophet', display_name: 'Door Prophet', avatar: avatar('doorprophet'), score: 210, wins: 2 },
];

await mkdir(dataDirectory, { recursive: true });
const existing = await readdir(dataDirectory);
if (existing.length && !force) {
  console.error('Seed skipped: data/ is not empty. Use --force to overwrite its seed files.');
  process.exitCode = 1;
} else {
  await writeJsonAtomic(resolve(dataDirectory, 'lore.json'), lore);
  await writeJsonAtomic(resolve(dataDirectory, 'loremasters.json'), loremasters);
  console.log('Seeded 5 lore entries and 6 Loremasters in data/.');
}

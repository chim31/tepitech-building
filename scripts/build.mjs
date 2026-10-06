// Builds index.html + assets/ from the raw quiz pages in sources/.
// Usage: node scripts/build.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* Write a base64 data: URI to assets/<dir>/<name>.jpg and return its public path. */
function writeImage(dir, name, dataUri) {
  const m = dataUri.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!m) throw new Error('Unexpected image format for ' + name);
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const rel = `assets/${dir}/${name}.${ext}`;
  fs.mkdirSync(path.join(ROOT, 'assets', dir), { recursive: true });
  fs.writeFileSync(path.join(ROOT, rel), Buffer.from(m[2], 'base64'));
  return rel;
}

/* ---------- Reading: TOEIC Reading Lab (text scans + explanations) ---------- */
const lab = read('sources/toeic_reading_lab.html');
const labJSON = id => JSON.parse(lab.match(new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)</script>`))[1]);
const labImages = labJSON('quiz-images');
const reading = labJSON('quiz-data').map(t => ({
  ...t,
  images: t.images.map(k => writeImage('reading', k, labImages[k])),
}));

/* ---------- Text Completion ---------- */
const tc = read('sources/text_completion_quiz.html');
const completion = Function('return ' + tc.match(/const Q=(\[[\s\S]*?\n\]);/)[1])();
// The source lists "seeing" twice for this gap.
const dup = completion[2].gaps[3];
if (dup.opts[3] === 'seeing') dup.opts[3] = 'to see';

/* ---------- Listening: Question / Réponse ---------- */
const lis = read('sources/quiz-ecoute-anglais.html');
const listening = Function('return ' + lis.match(/var quizData = (\[[\s\S]*?\n {2}\]);/)[1])();

/* ---------- Révision TOEIC: dialogues, grammar, passages ---------- */
const rev = read('sources/quiz-revision-toeic.html');
const revLine = rev.split('\n').find(l => l.startsWith('var QUIZDATA'));
const revRaw = JSON.parse(revLine.slice(revLine.indexOf('{')).replace(/;\s*$/, ''));
const revision = {
  cards: revRaw.cards.map(c => ({ ...c, image: writeImage('revision', 'c' + String(c.order).padStart(2, '0'), c.image) })),
  passages: revRaw.passages.map(p => ({ ...p, image: writeImage('revision', 'p' + String(p.order).padStart(2, '0'), p.image) })),
};

/* ---------- Inject ---------- */
const DATA = { reading, completion, listening, revision };
const json = JSON.stringify(DATA).replace(/<\//g, '<\\/');
const html = read('src/template.html').replace('/*__DATA__*/null', () => json);
if (html.includes('/*__DATA__*/')) throw new Error('Data placeholder not replaced');
fs.writeFileSync(path.join(ROOT, 'index.html'), html);

const count = (a, f) => a.reduce((s, x) => s + f(x), 0);
console.log(`index.html ${(html.length / 1024).toFixed(0)} KB`);
console.log(`reading ${reading.length} texts / ${count(reading, t => t.questions.length)} q`);
console.log(`completion ${completion.length} texts / ${count(completion, t => t.gaps.length)} gaps`);
console.log(`listening ${listening.length} q`);
console.log(`revision ${revision.cards.length} cards + ${revision.passages.length} passages / ${revision.cards.length + count(revision.passages, p => p.questions.length)} q`);

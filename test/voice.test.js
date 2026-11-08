const test = require('node:test');
const assert = require('node:assert/strict');

const { voiceProblem, inventedNumber } = require('../src/marketing/voice');

test('voiceProblem flags what reads as machine writing', () => {
  const bad = [
    'In today\'s fast market, brands need photos.',
    'We leverage AI for your catalog.',
    'A shoot costs money — a lot of it.',
    'Your photos are great 🚀',
    'It isn\'t about the photo. It\'s about the sale.',
    'This is not a camera problem but a calendar problem.',
    'No studio. No models. No reshoots.',
    'I tried it. The result? Three weeks saved.',
    'Here\'s why that matters.',
  ];
  for (const line of bad) assert.ok(voiceProblem(line), line);
});

test('voiceProblem passes a post a person would write', () => {
  const post = `The first ad my tool made for a snowboard was a jar of hand cream.

I gave it one photo of a board and it came back with "MAXIMUM STRENGTH RELIEF" printed on a jar. My own checker passed it, because by its maths the two pictures were close enough.

So now a second model looks at every ad before anyone sees it, and counts what's in the frame. Two boards in the photo means two boards in the ad, or it fails and the credit goes back.

If you're trying AI images for your store, ask the tool one thing first. Does it compare the result to your original, or does it trust itself?`;
  assert.equal(voiceProblem(post), null);
});

test('voiceProblem flags a wall of one-line fragments', () => {
  assert.ok(voiceProblem('I built it.\nIt broke.\nI fixed it.\nIt broke again.\nI learned.\nNow it works.\nFinally.'));
});

test('inventedNumber only allows numbers from the source', () => {
  const source = 'A 40-style shoot runs ₹1,50,000 and takes 3 weeks.';
  assert.equal(inventedNumber('40 styles, ₹1,50,000, 3 weeks.', source), null);
  assert.equal(inventedNumber('Saved 300% in 3 weeks.', source), '300');
});

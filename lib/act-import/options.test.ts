import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMathOptions, optionsFromParsedQuestion } from './options.ts';

function choices(correctIndex: number, labels = 'ABCDE') {
  return [...labels].map((label, i) => ({
    label,
    content_html: `<p>Answer ${i + 1}</p>`,
    is_correct: i === correctIndex,
  }));
}

test('each wrong choice can be removed while every source answer stays correct', () => {
  for (const labels of ['ABCDE', 'FGHJK']) {
    for (let correctIndex = 0; correctIndex < 5; correctIndex++) {
      for (let wrongIndex = 0; wrongIndex < 4; wrongIndex++) {
        const source = choices(correctIndex, labels);
        const before = structuredClone(source);
        const wrong = source.filter(o => !o.is_correct);
        const removed = wrong[wrongIndex];
        const result = optionsFromParsedQuestion('math', source, () => (wrongIndex + 0.5) / 4);

        assert.deepEqual(result.map(o => o.label), ['A', 'B', 'C', 'D']);
        assert.deepEqual(result.map(o => o.content_html), source.filter(o => o !== removed).map(o => o.content_html));
        assert.equal(result.filter(o => o.is_correct).length, 1);
        assert.equal(result.find(o => o.is_correct)?.content_html, source[correctIndex].content_html);
        assert.equal(result.find(o => o.is_correct)?.label, 'ABCD'[correctIndex - Number(source.indexOf(removed) < correctIndex)]);
        assert.deepEqual(source, before, 'Source options and key must not be mutated');
      }
    }
  }
});

test('normalization is stable for four choices and leaves other sections intact', () => {
  const noRandom = () => { throw new Error('Unexpected random selection'); };
  const reduced = normalizeMathOptions('math', choices(4), () => 0);
  assert.equal(normalizeMathOptions('math', reduced, noRandom), reduced);
  const four = choices(2, 'ABCD');
  assert.equal(normalizeMathOptions('math', four, noRandom), four);
  for (const section of ['english', 'reading', 'science']) {
    const five = choices(4);
    assert.equal(normalizeMathOptions(section, five, noRandom), five);
  }
  for (const labels of ['ABC', 'ABCDEF']) {
    const invalidCount = choices(0, labels);
    assert.equal(normalizeMathOptions('math', invalidCount, noRandom), invalidCount);
  }
});

test('missing and ambiguous source keys remain intact for correction', () => {
  const noRandom = () => { throw new Error('Cannot randomly remove an option without a valid key'); };
  for (const correctIndices of [[], [0, 4]]) {
    const source = choices(-1).map((o, i) => ({ ...o, is_correct: correctIndices.includes(i) }));
    const result = optionsFromParsedQuestion('math', source, noRandom);
    assert.deepEqual(result, source);
    assert.equal(result.length, 5);
  }
});

test('graph choices keep their images and carry their new labels into alt text', () => {
  for (const labels of ['ABCDE', 'FGHJK']) {
    const source = choices(4, labels);
    source[4].content_html = `<img src="graph.png" alt="Original graph option ${labels[4]}" />`;
    const result = optionsFromParsedQuestion('math', source, () => 0);
    assert.deepEqual(result[3], {
      label: 'D', content_html: '<img src="graph.png" alt="Graph option D" />', is_correct: true,
    });
    assert.match(source[4].content_html, /Original graph option/);
  }
});

test('four-choice parsing still normalizes legacy letters and omitted labels', () => {
  assert.deepEqual(optionsFromParsedQuestion('math', choices(3, 'FGHJ'), () => { throw new Error('Unexpected reduction'); }), choices(3, 'ABCD'));
  assert.deepEqual(optionsFromParsedQuestion('math', choices(2, 'ABCD').map(o => ({ content_html: o.content_html, is_correct: o.is_correct }))), choices(2, 'ABCD'));
});

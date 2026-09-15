import test from 'node:test';
import assert from 'node:assert/strict';
import { signReview, readReview, mergeOptions, canCombineMathStimulus } from './review.ts';
const secret = 'test-only-secret';
const review = { actor:'admin-a', target:'question-a', updatedAt:'2026-09-14', expires:2000, presentation:{stem_html:'<p>2+2?</p>', rationale_html:'Four',options:[]} };
test('review signature binds target, content, timestamp, actor and expiry', () => {
  const token = signReview(review, secret);
  assert.deepEqual(readReview(token, secret, 'admin-a', 1000), review);
  assert.throws(() => readReview(token, secret, 'admin-b', 1000));
  assert.throws(() => readReview(token, secret, 'admin-a', 2000));
  assert.throws(() => readReview(token, 'wrong-key', 'admin-a', 1000));
  for (const change of [{clearStimulus:true}, {target:'other'}, {updatedAt:'new'}, {presentation:{...review.presentation,stem_html:'altered'}}]) {
    const changed = Buffer.from(JSON.stringify({...review,...change})).toString('base64url') + '.' + token.split('.')[1];
    assert.throws(() => readReview(changed, secret, 'admin-a', 1000));
  }
  assert.throws(() => readReview(token + '.extra', secret, 'admin-a', 1000));
});
test('option markup replacement preserves identities, order, and grading properties', () => {
  const original = [{id:'stable-a',label:'A',content_html:'old a',content_html_rendered:'stale',credit:1},{id:'stable-b',label:'B',content_html:'old b',credit:0}];
  const result = mergeOptions(original,[{label:'B',content_html:'new b'},{label:'A',content_html:'new a'}]);
  assert.deepEqual(result,[{id:'stable-a',label:'A',content_html:'new a',credit:1},{id:'stable-b',label:'B',content_html:'new b',credit:0}]);
  assert.equal(original[0].content_html,'old a');
  assert.throws(() => mergeOptions(original,[{label:'C',content_html:'c'},{label:'A',content_html:'a'}]));
  assert.throws(() => mergeOptions(original,[{label:'A',content_html:'a'},{label:'A',content_html:'a'}]));
  assert.throws(() => mergeOptions(original,[]));
});

test('only known math domains can combine a separate stimulus',()=>{
 assert.equal(canCombineMathStimulus('Algebra'),true);
 for(const domain of [null,'','Information and Ideas','Expression of Ideas']) assert.equal(canCombineMathStimulus(domain),false);
});

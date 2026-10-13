const test = require('node:test'), assert = require('node:assert/strict');
const ratings = require('./article-ratings');
const order = (id = 'o1', customerId = 'c1') => ({ id, number: 1, customerId, payment: { status: 'PAID' }, status: 'delivered', items: [{ productId: 'dynamite-menu', name: 'Dynamite Chicken', quantity: 2 }, { productId: 'drink-coca', name: 'Coca' }] });
test('ratings: bought products only, integer stars, no duplicate entries or premature reviews', () => {
  const o = order(), db = { orders: [o] };
  assert.throws(() => ratings.saveArticleRatings(db, { ...o, status: 'confirmed' }, { ratings: [{ productId: 'dynamite', stars: 5 }] }), /remise/);
  for (const input of [{ productId: 'duck', stars: 5 }, { productId: 'dynamite', stars: 0 }, { productId: 'dynamite', stars: 4.5 }]) assert.throws(() => ratings.saveArticleRatings(db, o, { ratings: [input] }));
  assert.throws(() => ratings.saveArticleRatings(db, o, { ratings: [{ productId: 'dynamite', stars: 5 }, { productId: 'dynamite', stars: 1 }] }));
  const input = { ratings: [{ productId: 'dynamite', stars: 5 }, { productId: 'drink-coca', stars: 3 }] };
  ratings.saveArticleRatings(db, o, input); ratings.saveArticleRatings(db, o, input);
  assert.equal(db.articleRatings.length, 2); assert.equal(ratings.publicArticleRatings(db).dynamite.percent, 100);
  ratings.saveArticleRatings(db, o, { ratings: [{ productId: 'dynamite', stars: 4 }] });
  assert.equal(db.articleRatings.length, 2); assert.equal(ratings.publicArticleRatings(db).dynamite.percent, 100);
});
test('ratings: satisfaction is the share of verified 4/5-star votes, not the mean converted to percent', () => {
  const a = order(), b = order('o2', 'c2'), db = { orders: [a, b] };
  ratings.saveArticleRatings(db, a, { ratings: [{ productId: 'dynamite', stars: 5 }] });
  ratings.saveArticleRatings(db, b, { ratings: [{ productId: 'dynamite', stars: 4 }] });
  assert.deepEqual(ratings.publicArticleRatings(db), { dynamite: { count: 2, percent: 100, averageStars: 4.5 } });
  ratings.saveArticleRatings(db, b, { ratings: [{ productId: 'dynamite', stars: 3 }] });
  assert.deepEqual(ratings.publicArticleRatings(db), { dynamite: { count: 2, percent: 50, averageStars: 4 } });
  b.status = 'cancelled'; assert.equal(ratings.publicArticleRatings(db).dynamite.count, 1);
  ratings.deleteCustomerRatings(db, 'c1'); assert.deepEqual(ratings.publicArticleRatings(db), {});
});
test('ratings: malformed stored entries cannot create public votes', () => {
  const o = order(), db = { orders: [o], articleRatings: [{ orderId: 'o1', customerId: 'c2', productId: 'dynamite', stars: 5 }, { orderId: 'o1', customerId: 'c1', productId: 'duck', stars: 5 }, { orderId: 'o1', customerId: 'c1', productId: 'dynamite', stars: 9 }] };
  assert.deepEqual(ratings.publicArticleRatings(db), {});
});

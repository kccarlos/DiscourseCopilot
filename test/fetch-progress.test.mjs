import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateFetchProgress, formatEta, getTopicPagination } from '../src/shared/fetch-progress.mjs';

test('derives total raw pages from Discourse topic metadata', () => {
  const metadata = {
    post_stream: {
      stream: Array.from({ length: 253 }, (_, index) => index + 1),
      posts: Array.from({ length: 20 }, (_, index) => ({ id: index + 1 }))
    }
  };

  assert.deepEqual(getTopicPagination(metadata), {
    totalPosts: 253,
    pageSize: 100,
    totalPages: 3
  });
});

test('uses the raw endpoint page size when only a post count exists', () => {
  assert.deepEqual(getTopicPagination({ posts_count: 241 }), {
    totalPosts: 241,
    pageSize: 100,
    totalPages: 3
  });
});

test('calculates percentage, processed posts, and ETA from measured timing', () => {
  assert.deepEqual(
    calculateFetchProgress({
      currentPage: 2,
      totalPages: 5,
      totalPosts: 483,
      pageSize: 100,
      averageRequestMs: 500,
      requestDelayMs: 1000
    }),
    {
      currentPage: 2,
      totalPages: 5,
      totalPosts: 483,
      processedPosts: 200,
      percent: 40,
      etaMs: 4500
    }
  );
});

test('estimates ETA by remaining request waves when pages fetch concurrently', () => {
  const progress = calculateFetchProgress({
    currentPage: 2,
    totalPages: 10,
    totalPosts: 1000,
    pageSize: 100,
    averageRequestMs: 1000,
    concurrency: 4
  });

  assert.equal(progress.etaMs, 2000);
});

test('supports indeterminate progress when topic metadata is unavailable', () => {
  assert.deepEqual(
    calculateFetchProgress({
      currentPage: 2,
      averageRequestMs: 500,
      requestDelayMs: 1000
    }),
    {
      currentPage: 2,
      totalPages: null,
      totalPosts: null,
      processedPosts: null,
      percent: null,
      etaMs: null
    }
  );
});

test('formats short, long, unknown, and completed ETAs', () => {
  assert.equal(formatEta(null), 'Calculating ETA…');
  assert.equal(formatEta(4500), 'ETA ~5s');
  assert.equal(formatEta(65000), 'ETA ~1m 05s');
  assert.equal(formatEta(0), 'Finishing…');
});

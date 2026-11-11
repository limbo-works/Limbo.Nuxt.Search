import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { stringify } from 'devalue';
import {
	serializeSearchError,
	shouldSkipHydrationSearch,
} from '../composables/useLimboSearch.js';

test('skips browser request when SSR results are available during hydration', () => {
	assert.equal(shouldSkipHydrationSearch(true, true, [{ id: 1 }]), true);
});

test('keeps empty SSR result arrays available during hydration', () => {
	assert.equal(shouldSkipHydrationSearch(true, true, []), true);
});

test('requests search during client-side navigation', () => {
	assert.equal(shouldSkipHydrationSearch(true, false, [{ id: 1 }]), false);
});

test('requests search during hydration when SSR results are missing', () => {
	assert.equal(shouldSkipHydrationSearch(true, true, null), false);
	assert.equal(shouldSkipHydrationSearch(true, true, undefined), false);
});

test('does not skip SSR request', () => {
	assert.equal(shouldSkipHydrationSearch(false, true, [{ id: 1 }]), false);
});

test('converts errors to payload-serializable values', () => {
	const error = serializeSearchError(
		new TypeError('Search failed'),
		'Unexpected search error'
	);

	assert.deepEqual(error, {
		name: 'TypeError',
		message: 'Search failed',
	});
	assert.doesNotThrow(() => stringify({ error }));
});

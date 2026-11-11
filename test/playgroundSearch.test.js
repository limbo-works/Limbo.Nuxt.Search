import { strict as assert } from 'node:assert';
import { test } from 'node:test';

globalThis.defineEventHandler = (handler) => handler;
globalThis.getQuery = (event) => event.query || {};

const { default: searchHandler } = await import(
	'../.playground/server/api/jobs/search.get.js'
);

test('playground search returns paginated results', () => {
	const response = searchHandler({ query: { limit: '3', offset: '0' } });

	assert.equal(response.data.length, 3);
	assert.deepEqual(response.pagination, {
		limit: 3,
		offset: 0,
		total: 4,
	});
});

test('playground search filters results by text', () => {
	const response = searchHandler({ query: { text: 'designer' } });

	assert.equal(response.data.length, 1);
	assert.equal(response.data[0].title, 'Product Designer');
	assert.equal(response.pagination.total, 1);
});

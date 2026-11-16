import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
	computed,
	effectScope,
	isRef,
	onScopeDispose,
	reactive,
	ref,
	toValue,
	watch,
} from 'vue';

const source = await readFile(
	new URL('../composables/useLimboSearch.js', import.meta.url),
	'utf8'
);

// Nuxt replaces import.meta.client when compiling server and client bundles.
async function loadComposable(isClient) {
	const compiled = source.replaceAll('import.meta.client', String(isClient));
	return import(`data:text/javascript,${encodeURIComponent(compiled)}`);
}

const server = await loadComposable(false);
const client = await loadComposable(true);

Object.assign(globalThis, {
	computed,
	isRef,
	onScopeDispose,
	reactive,
	ref,
	toValue,
	watch,
});

function setup(t, routeQuery = {}) {
	let payload = new Map();
	let isHydrating = false;
	const requests = [];
	const route = { query: routeQuery, path: '/jobs', fullPath: '/jobs', hash: '' };

	Object.assign(globalThis, {
		useState: (key, init) => {
			if (!payload.has(key)) payload.set(key, ref(init()));
			return payload.get(key);
		},
		useRoute: () => route,
		useRouter: () => ({}),
		useNuxtApp: () => ({ isHydrating }),
		clearNuxtState: () => {},
		$fetch: async (url) => {
			requests.push(url);
			const params = new URL(url, 'https://example.test').searchParams;
			if (options.config.enableGroupedSearch) {
				return {
					groups: [
						{
							id: 1,
							items: [{ id: 1 }],
							limit: 10,
							offset: 0,
							total: 100,
						},
						{
							id: 2,
							items: [{ id: 2 }],
							limit: 5,
							offset: 0,
							total: 100,
						},
					],
				};
			}
			return {
				data: [{ id: requests.length }],
				pagination: {
					limit: Math.min(Number(params.get('limit')), 15),
					offset: Number(params.get('offset')),
					total: 100,
				},
			};
		},
	});

	const options = reactive({
		searchKey: 'jobs',
		extraParameters: {
			siteId: 'site',
			cultureId: 'culture-id',
			pageId: 'page',
			searchId: 'search',
			culture: 'da-DK',
			url: '/jobs',
		},
		searchFilters: {
			endpointUrl: '/api/citi/jobs',
			fields: [
				{ name: 'text', value: 'designer' },
				{ name: 'category', value: 'jobs', checked: true },
			],
		},
		config: {
			immediateSearch: { ssr: true, useUrlQuery: true },
			limit: 15,
			updateUrlQueryOnSearch: false,
		},
	});

	return {
		options,
		requests,
		async create(bundle) {
			const scope = effectScope();
			t.after(() => scope.stop());
			return scope.run(() => bundle.useLimboSearch(options));
		},
		hydrate() {
			payload = new Map(
				[...payload].map(([key, value]) => [
					key,
					ref(JSON.parse(JSON.stringify(value.value))),
				])
			);
			isHydrating = true;
		},
	};
}

function requestParameters(url) {
	return Object.fromEntries(new URL(url, 'https://example.test').searchParams);
}

test('SSR hydration skips initial request and fetchMore preserves search parameters', async (t) => {
	const harness = setup(t, { text: 'engineer', campaign: 'newsletter' });
	await harness.create(server);
	const initial = requestParameters(harness.requests[0]);
	assert.deepEqual(initial, {
		...harness.options.extraParameters,
		text: 'engineer',
		category: 'jobs',
		campaign: 'newsletter',
		limit: '15',
	});

	harness.hydrate();
	const search = await harness.create(client);
	assert.equal(harness.requests.length, 1);
	assert.equal(search.state.hasFetchedOnce, true);

	const completed = new Promise((resolve) => {
		harness.options.config.onAfterSearch = resolve;
	});
	search.fetchMore();
	await completed;

	assert.equal(harness.requests.length, 2);
	assert.deepEqual(requestParameters(harness.requests[1]), {
		...initial,
		limit: '15',
		offset: '15',
	});
	assert.equal(search.searchData.data.length, 2);
});

test('hydration uses SSR response pagination for next offset', async (t) => {
	const harness = setup(t, { limit: '30', offset: '15' });
	await harness.create(server);
	harness.hydrate();
	const search = await harness.create(client);
	await search.fetchMoreAsync();

	assert.equal(harness.requests.length, 2);
	assert.equal(requestParameters(harness.requests[1]).offset, '15');
});

test('client navigation keeps initial request and append parameters unchanged', async (t) => {
	const harness = setup(t);
	const search = await harness.create(client);
	assert.equal(harness.requests.length, 1);
	await search.fetchMoreAsync();

	assert.equal(harness.requests.length, 2);
	assert.deepEqual(requestParameters(harness.requests[1]), {
		...requestParameters(harness.requests[0]),
		offset: '15',
	});
});

test('grouped hydration preserves parameters and SSR pagination when fetching more', async (t) => {
	const harness = setup(t, { campaign: 'newsletter' });
	harness.options.config.enableGroupedSearch = true;
	harness.options.config.limit = { 1: 15, 2: 15 };
	await harness.create(server);
	const initial = requestParameters(harness.requests[0]);
	harness.hydrate();
	const search = await harness.create(client);
	assert.equal(harness.requests.length, 1);

	await search.fetchMoreAsync(1);
	assert.equal(harness.requests.length, 2);
	assert.deepEqual(requestParameters(harness.requests[1]), {
		...initial,
		groups: '1',
		l1: '15',
		o1: '10',
		l2: '5',
	});
});

for (const ssr of [true, false]) {
	test(`repeated append keeps displayed parameters with pending edits (SSR: ${ssr})`, async (t) => {
		const harness = setup(t);
		if (ssr) {
			await harness.create(server);
			harness.hydrate();
		}
		const search = await harness.create(client);
		const initial = requestParameters(harness.requests[0]);
		harness.options.searchFilters.fields[0].value = 'pending';
		harness.options.extraParameters.siteId = 'other-site';
		await search.fetchMoreAsync();
		await search.fetchMoreAsync();

		assert.equal(harness.requests.length, 3);
		assert.deepEqual(requestParameters(harness.requests[2]), {
			...initial,
			offset: '30',
		});
	});
}

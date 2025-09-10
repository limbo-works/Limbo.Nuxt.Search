export const useLimboSearch = async (options = {}) => {
	/*
		Options
		we repeat this way of getting variables in every function, computed
		value or watcher in which they are used as to keep reactivity, though
		we have left them in commented for the sake of clarity.

		Except the searchKey, which should not be replaced post initiation!
	*/

	// Efficient deep cloning utility to replace JSON.parse(JSON.stringify())
	// This provides better performance and handles edge cases
	const deepClone = (obj) => {
		if (obj === null || typeof obj !== 'object') return obj;
		if (obj instanceof Date) return new Date(obj.getTime());
		if (obj instanceof Array) return obj.map((item) => deepClone(item));
		if (typeof obj === 'object') {
			const cloned = {};
			for (const key in obj) {
				cloned[key] = deepClone(obj[key]);
			}
			return cloned;
		}
		return obj;
	};

	const {
		searchKey = '',
		// searchFilters,
		// config = {},
		// extraParameters = {},
		// parameterOverwrites = {},
	} = toValue(options || {});

	// Default data merger for simple array concatenation
	// This method is used when new search results need to be combined with existing ones
	const defaultDataMergerMethod = (newData, oldData) => {
		// Validate both data sets are arrays before attempting merge
		if (
			newData &&
			oldData &&
			Array.isArray(newData) &&
			Array.isArray(oldData)
		) {
			return [...oldData, ...newData];
		}
		// If not both arrays, return new data (replace old data)
		return newData;
	};

	// Complex data merger for grouped search results
	// This handles merging paginated groups where each group has its own items array
	const defaultGroupedDataMergerMethod = (newData, oldData) => {
		const compiledGroups = [];
		if (
			newData?.groups &&
			oldData?.groups &&
			Array.isArray(newData.groups) &&
			Array.isArray(oldData.groups)
		) {
			// Iterate through existing groups and merge with new data
			oldData.groups.forEach((group) => {
				// Find corresponding group in new data by ID
				const newGroup = newData.groups.find((newGroup) => {
					return newGroup.id === group.id;
				});
				if (newGroup) {
					// Merge items from both old and new group data
					newGroup.items = [...group.items, ...newGroup.items];
					compiledGroups.push(newGroup);
				} else {
					// Keep old group if no corresponding new group found
					compiledGroups.push(group);
				}
			});
			return { ...newData, groups: compiledGroups };
		}
		// Fallback: return new data or deep clone of old data if new data is invalid
		return newData || deepClone(oldData);
	};

	const defaultLimit = 12;
	const defaultConfig = {
		callMethod: 'GET', // { string } The method to use for the call
		enableLiveSearch: false, // { boolean|array } Can be an array of particular parameters triggering a live search or simply true or false
		immediateSearch: {
			useUrlQuery: true,
			ssr: true, // ssr: true will make the search run on the server side
		}, // { boolean|object } Can also be set to boolean value
		clearRouterHashOnSearch: false, // { boolean|object } Whether to clear the hash on search. If an object is used, the property "includeInitialSearch" to also clear for the first search, else that will be left out
		limit: { initial: defaultLimit, value: defaultLimit }, // { number|object } If a numeric limit is set, it will be used for both values - grouped paginations should be set with their ids (fx. limit: { 1: { initial: 18, value: 12 }, 2: { initial: 15, value: 6 } }).
		enableGroupedSearch: false, // { boolean } Make use of grouped pagination (l1, o1, l2, o2, (ie. l{id}, o{id}) etc.) instead of simply "limit" and "offset".
		groupParameter: 'groups', // { string } When needing to "fetch more / all" we need a parameter to filter that.
		updateUrlQueryOnSearch: true, // { boolean } Allow the page's url to reflect the search
		updateVueRouteOnSearch: false, // { boolean|object } Allow the vue router to reflect the search - may cause issues if the page is keyed based off the query. /* NOT FULLY DONE YET (DON'T CURRENTLY RE-SEARCH): If an object is used, set "pushHistory" to make each individual search part of the browser history. */
		clearSearchDataOnError: true, // { boolean } When toggled to false, the data from the previous search will persist on error
		allowSearchFiltersMutation: false, // { boolean } Needs to be explicitly turned on!
		updateSearchFiltersOnBindingChange: true, // { boolean } Whether a change in the bound search filters should trigger a change in the internally used data
		persistentParameters: ['contextId'], // { array } Parameters that should always be present in a search (empty or not)
		hiddenParameters: ['siteId', 'contextId', 'pageId', 'cultureId'], // { array } Parameters that should not be shown in the url.
		defaultParameterValues: {}, // { object } Default values for parameters - parameters will not be shown in the url if they have the same value as the default value

		searchDelay: 0, // { number } Delay in ms before the search is triggered
		urlFilterMapping: {}, // { object } Mapping for filters to url parameters, NOT FULLY IMPLEMENTED YET

		fetchOptions: {}, // { object } Extra options to pass to the fetch method

		// Data transformation methods
		searchResponseTransformerMethod: (val) => val, // { function } Method to transform the response data
		searchBodyTransformerMethod: (val) => val, // { function } Method to transform the searchBody data, ONLY used when callMethod is POST
		dataMergerMethod: defaultDataMergerMethod, // { function } Method to merge new data with old data
		dataOutputTransformerMethod: (val) => val, // { function } Method to transform the output data. Note that this method doesn't change the internally stored data, but only the data place in the bindings.

		// Hooks
		onInit: () => {}, // { function } Hook for when the search is initiated. The reactive Limbo search object is passed as the first argument.
		onAfterSearch: () => {}, // { function } Hook for when the search is completed. The reactive Limbo search object is passed as the first argument and the state as the second argument.
	};

	const lastRequestedUrl = ref(null);
	const activeRequestController = ref(null); // AbortController for request cancellation
	const requestTimeout = ref(null);

	onBeforeUnmount(() => {
		// Cancel any active requests to prevent race conditions
		if (activeRequestController.value) {
			activeRequestController.value.abort('The component was unmounted.');
		}
		// Clear timeout if any
		if (typeof window !== 'undefined' && requestTimeout.value) {
			window.clearTimeout(requestTimeout.value);
		}
		// Clear Nuxt state
		clearNuxtState([`searchData${searchKey}`, `searchState${searchKey}`]);
	});

	const defaultSearchData = {
		data: null,
		facets: null,
		pagination: null,
		meta: null,
		misc: null,
		error: null,
	};
	const reservedParameters = ['limit', 'offset', 'total'];

	const searchData = useState(`searchData${searchKey}`, () =>
		deepClone(defaultSearchData)
	);

	const searchFilters = computed(() => {
		const { searchFilters } = toValue(options || {});
		if (searchFilters && isRef(searchFilters)) {
			return searchFilters.value;
		}
		return searchFilters;
	});

	const internalSearchFilters = ref(
		removeReservedParameters(searchFilters.value)
	);
	const searchFiltersClone = ref(
		removeReservedParameters(deepClone(searchFilters.value))
	);
	const internalExtraParameters = ref({});
	const internalPagination = ref({});

	const state = useState(`searchState${searchKey}`, () => ({
		isInitiated: false,
		isLoading: false,
		hasFetchedOnce: false,
		hasMoreItems: undefined,
		isAppend: false,
		isUpdated: false,
	}));
	const query = ref({
		parameters: null,
	});
	const latestResponse = ref(null);

	const compConfig = computed(() => {
		const { config = {} } = toValue(options || {});
		const _return = { ...defaultConfig, ...config };
		if (
			_return.dataMergerMethod === defaultDataMergerMethod &&
			_return.enableGroupedSearch
		) {
			_return.dataMergerMethod = defaultGroupedDataMergerMethod;
		}
		return _return;
	});

	const filters = computed(() => {
		if (compConfig.value.allowSearchFiltersMutation) {
			return internalSearchFilters.value;
		}
		return searchFiltersClone.value;
	});

	const endpointUrl = computed(() => {
		return filters.value?.endpointUrl;
	});
	const fields = computed(() => {
		return filters.value?.fields;
	});

	const searchFilterParameters = computed(() => {
		// Safely extract field parameters from search filters
		// This reduces the risk of null pointer exceptions when fields are undefined
		const fieldParameters =
			fields.value?.reduce((reducer, field) => {
				if (field?.name) {
					if (Array.isArray(field.value)) {
						const item = field.value.find((item) => item?.checked);
						if (item && item.value !== undefined) {
							reducer[field.name] = item.value;
						}
					} else if (field.value !== undefined) {
						reducer[field.name] = field.value;
					}
				}
				return reducer;
			}, {}) ?? {};
		return fieldParameters;
	});

	// Complex pagination structure that adapts to both simple and grouped search modes
	// In grouped mode: { "1": { limit: 12, offset: 0 }, "2": { limit: 6, offset: 0 } }
	// In simple mode: { limit: 12, offset: 0 }
	const pagination = computed(() => {
		if (compConfig.value.enableGroupedSearch) {
			// Convert internal pagination object to URL parameter format (l1, o1, l2, o2, etc.)
			return convertToParameterStyledPagination(internalPagination.value);
		}
		// Simple pagination mode - just limit and offset
		const pagination = { limit: 0, offset: 0 };
		const { limit, offset } = internalPagination.value ?? {};
		if (typeof limit !== 'undefined') {
			pagination.limit = limit;
		}
		if (typeof offset !== 'undefined') {
			pagination.offset = offset;
		}
		return pagination;
	});

	const watchedParameters = computed(() => {
		const { extraParameters = {}, parameterOverwrites = {} } = toValue(
			options || {}
		);
		const parameters = {
			...extraParameters,
			...searchFilterParameters.value,
		};
		for (const key in parameterOverwrites) {
			parameters[key] = parameterOverwrites[key];
		}
		return parameters;
	});

	const parameters = computed(() => {
		const { extraParameters = {}, parameterOverwrites = {} } = toValue(
			options || {}
		);
		const parameters = {
			...extraParameters,
			...internalExtraParameters.value,
			...searchFilterParameters.value,
			...pagination.value,
			...parameterOverwrites,
		};
		for (const name in parameters) {
			const value = parameters[name];
			if (
				value == null &&
				!compConfig.value.persistentParameters?.includes?.(name)
			) {
				delete parameters[name];
			}
		}
		return parameters;
	});

	const hideGroupsParameter = computed(() => {
		const { parameterOverwrites = {} } = toValue(options || {});
		if (
			compConfig.value.enableGroupedSearch &&
			typeof internalExtraParameters.value[
				compConfig.value.groupParameter
			] !== 'undefined'
		) {
			const parameters = {
				...searchFilterParameters.value,
				...pagination.value,
				...parameterOverwrites,
			};
			for (const name in parameters) {
				const value = parameters[name];
				if (
					name === compConfig.value.groupParameter &&
					(value ||
						compConfig.value.persistentParameters?.includes?.(name))
				) {
					return false;
				}
			}
			return true;
		}
		return false;
	});

	watch(
		searchFilters,
		(newFilters) => {
			if (compConfig.value.updateSearchFiltersOnBindingChange) {
				internalSearchFilters.value =
					removeReservedParameters(newFilters);
				searchFiltersClone.value = removeReservedParameters(
					deepClone(newFilters)
				);
			}
		},
		{ deep: true }
	);

	watch(
		watchedParameters,
		(newParams, oldParams) => {
			const { enableLiveSearch } = compConfig.value;
			if (enableLiveSearch) {
				if (!Array.isArray(enableLiveSearch)) {
					if (
						state.value.hasFetchedOnce &&
						JSON.stringify(newParams) !== JSON.stringify(oldParams)
					) {
						submit();
					}
				} else if (state.value.hasFetchedOnce) {
					for (let i = 0; i < enableLiveSearch.length; i++) {
						const key = enableLiveSearch[i];
						if (newParams[key] !== oldParams[key]) {
							submit();
							break;
						}
					}
				}
			}
		},
		{ deep: true }
	);

	const route = useRoute();

	function submit() {
		internalExtraParameters.value = {};
		resetPagination();
		requestSearch();
	}

	function submitWithLimit(limit) {
		internalExtraParameters.value = {};
		resetPagination();
		if (typeof limit === 'number') {
			requestSearch({
				parameterOverwrites: {
					limit: limit,
				},
			});
		} else {
			requestSearch();
		}
	}

	function fetchMore(amount) {
		// Set a default amount if none is provided with safe numeric conversion
		amount ??=
			(compConfig.value.limit?.value ??
				parseInt(compConfig.value.limit)) ||
			defaultLimit;

		// Ensure amount is a valid positive number
		amount = Math.max(0, parseInt(amount) || defaultLimit);

		// Cancel out if we are already loading or there are no more items
		if (state.value.isLoading || !state.value.hasMoreItems) {
			return;
		}

		// Set new internal pagination with safe numeric conversion
		const currentOffset = parseInt(internalPagination.value?.offset) || 0;
		const currentLimit = parseInt(internalPagination.value?.limit) || 0;

		internalPagination.value.offset = currentOffset + currentLimit;
		internalPagination.value.limit = amount;

		// Request the search
		requestSearch({ append: true });
	}
	async function fetchMoreAsync(amount) {
		// Set a default amount if none is provided with safe numeric conversion
		amount ??=
			(compConfig.value.limit?.value ??
				parseInt(compConfig.value.limit)) ||
			defaultLimit;

		// Ensure amount is a valid positive number
		amount = Math.max(0, parseInt(amount) || defaultLimit);

		// Cancel out if we are already loading or there are no more items
		if (state.value.isLoading || !state.value.hasMoreItems) {
			return;
		}

		// Set new internal pagination with safe numeric conversion
		const currentOffset = parseInt(internalPagination.value?.offset) || 0;
		const currentLimit = parseInt(internalPagination.value?.limit) || 0;

		internalPagination.value.offset = currentOffset + currentLimit;
		internalPagination.value.limit = amount;

		// Request the search
		await requestSearch({ append: true });
	}

	function fetchMoreGroup(id, amount) {
		// Add null safety checks to prevent runtime errors
		if (!searchData?.value?.error && state.value?.hasMoreItems?.[id]) {
			// Make sure that we don't fetch the other groups as well
			internalExtraParameters.value[compConfig.value.groupParameter] = id;

			// Set a default amount if none is provided
			amount ??=
				(compConfig.value.limit?.[id]?.value ??
					parseInt(compConfig.value.limit?.[id])) ||
				defaultLimit;
			amount = +amount;

			// Set new internal pagination with null safety
			const internal = internalPagination.value?.[id] || {};
			const paginationData = searchData?.value?.pagination?.[id];
			if (paginationData) {
				// Safe numeric conversion with fallbacks
				const currentOffset = parseInt(paginationData.offset) || 0;
				const currentLimit = parseInt(paginationData.limit) || 0;
				internal.offset = currentOffset + currentLimit;
				internal.limit = Math.max(0, parseInt(amount) || defaultLimit);
				if (!internalPagination.value) {
					internalPagination.value = {};
				}
				internalPagination.value[id] = internal;

				// Request the search
				requestSearch({ append: true });
			}
		}
	}
	async function fetchMoreGroupAsync(id, amount) {
		// Add null safety checks to prevent runtime errors
		if (!searchData?.value?.error && state.value?.hasMoreItems?.[id]) {
			// Make sure that we don't fetch the other groups as well
			internalExtraParameters.value[compConfig.value.groupParameter] = id;

			// Set a default amount if none is provided with safe numeric conversion
			amount ??=
				(compConfig.value.limit?.[id]?.value ??
					parseInt(compConfig.value.limit?.[id])) ||
				defaultLimit;
			amount = Math.max(0, parseInt(amount) || defaultLimit);

			// Set new internal pagination with null safety
			const internal = internalPagination.value?.[id] || {};
			const paginationData = searchData?.value?.pagination?.[id];
			if (paginationData) {
				// Safe numeric conversion with fallbacks
				const currentOffset = parseInt(paginationData.offset) || 0;
				const currentLimit = parseInt(paginationData.limit) || 0;
				internal.offset = currentOffset + currentLimit;
				internal.limit = Math.max(0, parseInt(amount) || defaultLimit);
				if (!internalPagination.value) {
					internalPagination.value = {};
				}
				internalPagination.value[id] = internal;

				// Request the search
				await requestSearch({ append: true });
			}
		}
	}

	function fetchAll() {
		if (!searchData?.value?.error && state.value.hasMoreItems) {
			internalPagination.value.offset =
				+searchData?.value?.pagination?.offset +
				+searchData?.value?.pagination?.limit;
			internalPagination.value.limit =
				+searchData?.value?.pagination?.total -
				internalPagination.value.offset;
			requestSearch({ append: true });
		}
	}
	async function fetchAllAsync() {
		if (!searchData?.value?.error && state.value.hasMoreItems) {
			internalPagination.value.offset =
				+searchData?.value?.pagination?.offset +
				+searchData?.value?.pagination?.limit;
			internalPagination.value.limit =
				+searchData?.value?.pagination?.total -
				internalPagination.value.offset;
			await requestSearch({ append: true });
		}
	}

	function fetchAllGroup(id) {
		// Add null safety checks to prevent runtime errors
		if (!searchData?.value?.error && state.value?.hasMoreItems?.[id]) {
			// Make sure that we don't fetch the other groups as well
			internalExtraParameters.value[compConfig.value.groupParameter] = id;

			// Fetch with null safety
			const internal = internalPagination.value?.[id] || {};
			const paginationData = searchData?.value?.pagination?.[id];
			if (paginationData) {
				// Safe numeric conversion with fallbacks
				const currentOffset = parseInt(paginationData.offset) || 0;
				const currentLimit = parseInt(paginationData.limit) || 0;
				const totalItems = parseInt(paginationData.total) || 0;
				internal.offset = currentOffset + currentLimit;
				internal.limit = Math.max(0, totalItems - internal.offset);
				if (!internalPagination.value) {
					internalPagination.value = {};
				}
				internalPagination.value[id] = internal;
				requestSearch({ append: true });
			}
		}
	}
	async function fetchAllGroupAsync(id) {
		// Add null safety checks to prevent runtime errors
		if (!searchData?.value?.error && state.value?.hasMoreItems?.[id]) {
			// Make sure that we don't fetch the other groups as well
			internalExtraParameters.value[compConfig.value.groupParameter] = id;

			// Fetch with null safety
			const internal = internalPagination.value?.[id] || {};
			const paginationData = searchData?.value?.pagination?.[id];
			if (paginationData) {
				// Safe numeric conversion with fallbacks
				const currentOffset = parseInt(paginationData.offset) || 0;
				const currentLimit = parseInt(paginationData.limit) || 0;
				const totalItems = parseInt(paginationData.total) || 0;
				internal.offset = currentOffset + currentLimit;
				internal.limit = Math.max(0, totalItems - internal.offset);
				if (!internalPagination.value) {
					internalPagination.value = {};
				}
				internalPagination.value[id] = internal;
				await requestSearch({ append: true });
			}
		}
	}

	async function requestSearch(options) {
		const { delay, append, parameterOverwrites } = {
			delay: compConfig.value.searchDelay,
			append: false,
			parameterOverwrites: {},
			...options,
		};
		let clearHash = false;
		if (
			!append &&
			route.hash &&
			compConfig.value.clearRouterHashOnSearch &&
			(!compConfig.value.immediateSearch ||
				state.value.hasFetchedOnce ||
				compConfig.value.clearRouterHashOnSearch?.includeInitialSearch)
		) {
			clearHash = true;
		}
		state.value.isInitiated = true;
		state.value.isLoading = true;

		// The search requesting with improved error handling
		const searchRequest = async () => {
			try {
				// Cancel any existing request to prevent race conditions
				if (activeRequestController.value) {
					activeRequestController.value.abort(
						'New search initiated.'
					);
				}

				// Create new controller for this request
				const currentRequestController = new AbortController();
				activeRequestController.value = currentRequestController;

				const fetchOptions = compConfig.value.fetchOptions || {};
				const params = {
					...(append
						? {
								...query.value.parameters,
								...internalExtraParameters.value,
								...convertToParameterStyledPagination(
									internalPagination.value
								),
							}
						: parameters.value),
					...(parameterOverwrites || {}),
				};
				const serializedParams = getSerializedParams(params);
				if (
					compConfig.value.updateUrlQueryOnSearch ||
					compConfig.value.updateVueRouteOnSearch
				) {
					setUrlQuery(serializedParams, clearHash);
				}
				requestTimeout.value = null;

				lastRequestedUrl.value = `${endpointUrl.value}?${serializedParams}`;
				if (compConfig.value.callMethod === 'POST') {
					lastRequestedUrl.value = endpointUrl.value;
				}
				state.value.isAppend = !!append;
				const currentlyRequestedUrl = lastRequestedUrl.value;

				const data = await $fetch(lastRequestedUrl.value, {
					method: compConfig.value.callMethod,
					body:
						compConfig.value.callMethod === 'POST'
							? compConfig.value.searchBodyTransformerMethod(
									params
								)
							: null,
					signal: currentRequestController.signal, // Add abort signal
					...fetchOptions,
					onResponseError(event) {
						const { response } = event;
						// Only handle error if this request hasn't been cancelled
						if (
							!requestTimeout.value &&
							!currentRequestController?.signal?.aborted
						) {
							searchData.value = {
								...defaultSearchData,
								...searchData.value,
							};
							state.value.hasFetchedOnce = import.meta.client;
							if (compConfig.value.clearSearchDataOnError) {
								state.value.hasMoreItems = undefined;
								Object.assign(
									searchData.value,
									defaultSearchData
								);
								latestResponse.value = null;
							} else {
								if (compConfig.value.enableGroupedSearch) {
									for (const key in state.value
										.hasMoreItems) {
										state.value.hasMoreItems[key] = false;
									}
								} else {
									state.value.hasMoreItems = false;
								}
							}
							// Enhanced error handling - ensure response data is safe to use
							searchData.value.error = response?._data ||
								response?.data || {
									message: 'An unexpected error occurred',
									status: response?.status || 500,
								};
							state.value.isLoading = false;

							if (fetchOptions.onResponseError) {
								return fetchOptions.onResponseError(event);
							}
						} else if (fetchOptions.onResponseError) {
							return fetchOptions.onResponseError(event);
						}
					},
				}).catch((error) => {
					// Throw as abort error
					if (!currentRequestController?.signal?.aborted) {
						throw error;
					}
				});

				// Check if request was cancelled or URL changed (race condition protection)
				if (
					currentRequestController?.signal?.aborted ||
					lastRequestedUrl.value != currentlyRequestedUrl
				) {
					return;
				}

				if (!requestTimeout.value) {
					state.value.hasFetchedOnce = import.meta.client;
					let response =
						compConfig.value.searchResponseTransformerMethod?.(
							data
						) ?? data;
					latestResponse.value = data; // save for later

					// On append, merge the paginations
					if (append && searchData.value.pagination && response) {
						if (response.pagination) {
							response.pagination = {
								...searchData.value.pagination,
								...response.pagination,
							};
						} else {
							response.pagination = {
								...searchData.value.pagination,
							};
						}
					} // Should probably merge facets and misc as well... A thing for the future?

					// Set the everything
					searchData.value = {
						...defaultSearchData,
						...searchData.value,
					};

					searchData.value.error = null;
					const newData = compConfig.value.enableGroupedSearch
						? response
						: response?.data;
					searchData.value.data = append // Data is getting merged
						? (compConfig.value.dataMergerMethod?.(
								newData,
								deepClone(searchData.value.data)
							) ?? newData)
						: newData;
					searchData.value.facets = response?.facets;
					searchData.value.meta = response?.meta;
					searchData.value.misc = response?.misc;
					query.value.parameters = {
						...parameters.value,
					};
					if (compConfig.value.enableGroupedSearch) {
						// Group pagination
						state.value.hasMoreItems = {};
						searchData.value.pagination = response?.pagination;
						if (!searchData.value.pagination) {
							searchData.value.pagination = {};
						}
						response?.groups?.forEach((group) => {
							if ('id' in group) {
								searchData.value.pagination[group.id] = {
									limit: group.limit || 0,
									offset: group.offset || 0,
									total: group.total || 0,
								};
							}
						});
						for (const key in searchData.value.pagination) {
							const value = Object.assign(
								{ limit: 0, offset: 0, total: 0 },
								searchData.value.pagination[key]
							);
							searchData.value.pagination[key] = value;
							internalPagination.value[key] = {
								...value,
							};
							state.value.hasMoreItems[key] =
								value.limit + value.offset < value.total;
						}
					} else {
						// Ordinary pagination
						searchData.value.pagination = Object.assign(
							{ limit: 0, offset: 0, total: 0 },
							response?.pagination
						);
						internalPagination.value.limit =
							searchData.value.pagination.limit;
						internalPagination.value.offset =
							searchData.value.pagination.offset;
						state.value.hasMoreItems =
							searchData.value.pagination.limit +
								searchData.value.pagination.offset <
							searchData.value.pagination.total;
					}
					state.value.isLoading = false;
					// Clean up the request controller
					activeRequestController.value = null;
				}
			} catch (error) {
				// Handle any unexpected errors during the search process
				// Don't log AbortError as these are intentional cancellations
				if (
					error.name !== 'AbortError' &&
					!activeRequestController.value?.signal?.aborted
				) {
					console.error(
						'[Limbo Search] Unexpected error during search:',
						error
					);
					state.value.isLoading = false;
					searchData.value.error = {
						message:
							error?.message || 'An unexpected error occurred',
						originalError: error,
					};
				}
				// Clean up the request controller
				activeRequestController.value = null;
			}
		};
		// Run on client or server with error handling
		try {
			if (typeof window !== 'undefined' && delay > 0) {
				await new Promise((resolve) => {
					window.clearTimeout(requestTimeout.value);
					requestTimeout.value = window.setTimeout(resolve, delay);
				});
			}
			await searchRequest();
			compConfig.value.onAfterSearch?.(
				deepClone(searchData.value),
				deepClone(state.value)
			);
		} catch (error) {
			// Final error handler for any unhandled errors
			console.error(
				'[Limbo Search] Critical error in requestSearch:',
				error
			);
			state.value.isLoading = false;
			searchData.value.error = searchData.value.error || {
				message: 'A critical error occurred during search',
				originalError: error,
			};
		}
	}

	function getSerializedParams(parameters = parameters.value) {
		const array = [];
		for (const key in parameters) {
			const value = parameters[key];
			const isPersistent =
				compConfig.value?.persistentParameters?.includes?.(key);
			if (Array.isArray(value)) {
				const item = parameters?.find?.((item) => item.value === value);
				if ((item && item.value) || isPersistent) {
					array.push(`${key}=${item?.value}`);
				}
			} else if (
				value ||
				(key in (compConfig.value.defaultParameterValues || {}) &&
					value != compConfig.value.defaultParameterValues?.[key]) ||
				isPersistent
			) {
				array.push(`${key}=${value ?? ''}`);
			}
		}
		return array.join('&');
	}

	function resetPagination() {
		if (!internalPagination.value) {
			internalPagination.value = {};
		}
		if (compConfig.value.enableGroupedSearch) {
			// Grouped pagination
			for (const key in compConfig.value.limit) {
				if (key === String(parseInt(key))) {
					const value = internalPagination.value[key] || {};
					internalPagination.value[key] = value;
				}
			}
			for (const key in internalPagination.value) {
				const value = internalPagination.value[key];
				value.limit =
					(compConfig.value.limit[key]?.initial ??
						compConfig.value.limit[key]?.value ??
						compConfig.value.limit[key]) ||
					defaultLimit;
				value.offset = 0;
			}
		} else {
			// Ordinary pagination
			internalPagination.value.limit =
				(compConfig.value.limit?.initial ??
					compConfig.value.limit?.value ??
					compConfig.value.limit) ||
				defaultLimit;
			internalPagination.value.offset = 0;
		}
	}

	function resetState() {
		state.value = {
			isInitiated: false,
			isLoading: false,
			hasFetchedOnce: false,
			hasMoreItems: undefined,
			isAppend: false,
			isUpdated: false,
		};
	}

	const router = useRouter();

	// URL parameter synchronization logic
	// This complex function manages the relationship between internal search state and browser URL
	function setUrlQuery(query = getSerializedParams(), clearHash = false) {
		const array = query.split('&').filter((item) => {
			const key = item.split('=').shift();
			let value = item.split('=').pop();
			// TODO: implement urlFilterMapping

			// Hide group parameter when fetching specific groups to avoid URL pollution
			if (
				key === compConfig.value.groupParameter &&
				hideGroupsParameter.value
			) {
				return false;
			}

			// Filter out parameters that match their default values to keep URLs clean
			const initialLimit =
				(compConfig.value.limit?.initial ??
					compConfig.value.limit?.value ??
					compConfig.value.limit) ||
				defaultLimit;
			const defaultParameterValues = {
				limit: initialLimit,
				offset: 0,
				...compConfig.value.defaultParameterValues,
			};

			// Handle grouped pagination defaults (l1, o1, l2, o2, etc.)
			if (!(key in defaultParameterValues)) {
				if (key === `l${String(parseInt(key.substring(1)))}`) {
					const id = key.substring(1);
					defaultParameterValues[`l${id}`] =
						(compConfig.value.limit[id]?.initial ??
							compConfig.value.limit[id]?.value ??
							compConfig.value.limit[id]) ||
						defaultLimit;
				}
				if (key === `o${String(parseInt(key.substring(1)))}`) {
					defaultParameterValues[key] = 0;
				}
			}

			// Exclude parameters that match defaults or are explicitly hidden
			if (
				key in defaultParameterValues &&
				String(defaultParameterValues[key]) === (value ?? '')
			) {
				return false;
			}
			return !compConfig.value.hiddenParameters?.includes?.(key);
		});
		const transformedArray = array.map((item) => {
			const key = item.split('=').shift();
			let value = item.split('=').pop();
			if (key in compConfig.value.urlFilterMapping) {
				const mappedKey = compConfig.value.urlFilterMapping[key];
				if (value in mappedKey) {
					value = mappedKey[value];
				}
			}
			return `${key}=${value}`;
		});

		const url =
			[route.path, transformedArray.join('&')].filter(Boolean).join('?') +
			(clearHash
				? ''
				: typeof window !== 'undefined'
					? window.location.hash
					: route.hash);

		const oldUrl =
			typeof window === 'undefined'
				? route.fullPath
				: [
						window.location.pathname,
						window.location.search,
						window.location.hash,
					]
						.filter(Boolean)
						.join('');
		typeof window !== 'undefined' &&
			compConfig.value.updateUrlQueryOnSearch &&
			window.history.replaceState(window.history.state, '', url);

		if (
			compConfig.value.updateVueRouteOnSearch &&
			decodeURIComponent(route.fullPath) !== decodeURIComponent(url)
		) {
			compConfig.value.updateVueRouteOnSearch?.pushHistory
				? router.push(url)
				: router.replace(url);
		}
		// Edge case, but might as well handle it
		if (
			typeof window !== 'undefined' &&
			compConfig.value.updateVueRouteOnSearch &&
			compConfig.value.updateUrlQueryOnSearch
		) {
			window.history.replaceState(window.history.state, '', oldUrl);
		}
	}

	// Check if initiated
	if (!compConfig.value.immediateSearch) {
		resetPagination();
		state.value.isInitiated = true;
	}

	// SSR and client-side initialization logic
	// This section handles the complex initialization flow for both server and client
	if (
		compConfig.value.immediateSearch &&
		(compConfig.value.immediateSearch?.ssr ||
			typeof compConfig.value.immediateSearch === 'boolean')
	) {
		resetPagination();

		// Initialize search parameters from URL query if enabled
		if (
			compConfig.value.immediateSearch?.useUrlQuery ||
			typeof compConfig.value.immediateSearch === 'boolean'
		) {
			mixParametersFromUrl();

			// Adjust pagination for initial load to include offset items
			// This ensures that when offset=20&limit=10, we actually fetch 30 items
			if (compConfig.value.enableGroupedSearch) {
				// Grouped pagination adjustment
				for (const key in internalPagination.value) {
					const value = internalPagination.value[key];
					if (value.limit) {
						value.limit = +value.limit;
					}
					if (value.offset) {
						// Add offset to limit to get all items from start to current page
						value.limit = +value.limit + +value.offset;
						value.offset = 0; // Reset offset since we're fetching from beginning
					}
				}
			} else {
				// Ordinary pagination adjustment
				if (internalPagination.value.limit) {
					internalPagination.value.limit =
						+internalPagination.value.limit;
				}
				if (internalPagination.value.offset) {
					// Add offset to limit to get all items from start to current page
					internalPagination.value.limit =
						+internalPagination.value.limit +
						+internalPagination.value.offset;
					internalPagination.value.offset = 0; // Reset offset since we're fetching from beginning
				}
			}
		}

		await requestSearch({ delay: 0 });
	}

	const limboSearch = reactive({
		// Data
		searchData,
		compConfig,
		state,
		query,
		lastRequestedUrl,
		latestResponse,
		watchedParameters,

		// Methods
		requestSearch,
		fetchMore: compConfig.value.enableGroupedSearch
			? fetchMoreGroup
			: fetchMore,
		fetchMoreAsync: compConfig.value.enableGroupedSearch
			? fetchMoreGroupAsync
			: fetchMoreAsync,
		fetchAll: compConfig.value.enableGroupedSearch
			? fetchAllGroup
			: fetchAll,
		fetchAllAsync: compConfig.value.enableGroupedSearch
			? fetchAllGroupAsync
			: fetchAllAsync,
		submit,
		submitWithLimit,
		setUrlQuery,
		resetPagination,
		resetState,
		getSerializedParams,
	});

	compConfig.value.onInit?.(limboSearch);
	return limboSearch;

	// Internal helper functions
	function removeReservedParameters(filters) {
		const newFilters = { ...(filters || {}) };
		if (filters?.fields && Array.isArray(filters.fields)) {
			newFilters.fields = filters.fields.filter(
				(field) =>
					!reservedParameters.includes(field.name.toLowerCase())
			);
		}
		return newFilters;
	}

	function convertToParameterStyledPagination(pagination) {
		if (compConfig.value.enableGroupedSearch) {
			const newPagination = {};
			for (const key in pagination) {
				const value = pagination[key];
				if (typeof value?.limit !== 'undefined') {
					newPagination[`l${key}`] = value.limit;
				}
				if (typeof value?.offset !== 'undefined') {
					newPagination[`o${key}`] = value.offset;
				}
			}
			return newPagination;
		}
		return pagination;
	}

	function setSearchFilterField(key, value) {
		const { fields = [] } = filters.value || {};
		const field = fields.find((field) => {
			return field.name === key;
		});

		if (field) {
			if (Array.isArray(field.value)) {
				if (field.value.find((item) => item.value === value)) {
					field.value.forEach((item) => {
						item.checked = item.value === value;
					});
				}
			} else {
				field.value = value ?? '';
			}
			return true;
		}
		return false; // Return false if the field does not exist
	}

	// URL parameter parsing and internal state synchronization
	// This function parses URL query parameters and maps them to internal search state
	function mixParametersFromUrl() {
		const { query } = route;
		for (const key in query) {
			const value = query[key];

			// Handle pagination parameters for both grouped and simple modes
			if (compConfig.value.enableGroupedSearch) {
				// Parse grouped pagination parameters (l1, o1, l2, o2, etc.)
				const array = key.toLowerCase().split('');
				const firstLetter = array.shift();
				const remainder = array.join('');
				if (
					(firstLetter === 'o' || firstLetter === 'l') &&
					remainder === String(parseInt(remainder))
				) {
					const object = Object.assign(
						{ limit: 0, offset: 0 },
						internalPagination?.value?.[remainder]
					);
					// Safe numeric conversion with validation
					if (firstLetter === 'o') {
						const numericValue = parseInt(value);
						object.offset = isNaN(numericValue)
							? 0
							: Math.max(0, numericValue);
					}
					if (firstLetter === 'l') {
						const numericValue = parseInt(value);
						object.limit = isNaN(numericValue)
							? defaultLimit
							: Math.max(0, numericValue);
					}
					internalPagination.value = Object.assign(
						internalPagination.value,
						{
							[remainder]: object,
						}
					);
					continue;
				}
			} else {
				// Handle simple pagination parameters
				if (key.toLowerCase() === 'limit') {
					const numericValue = parseInt(value);
					const safeLimit = isNaN(numericValue)
						? defaultLimit
						: Math.max(0, numericValue);
					if (!internalPagination.value) {
						internalPagination.value = {
							limit: safeLimit,
							offset: 0,
						};
						continue;
					}
					internalPagination.value.limit = safeLimit;
					continue;
				} else if (key.toLowerCase() === 'offset') {
					const numericValue = parseInt(value);
					const safeOffset = isNaN(numericValue)
						? 0
						: Math.max(0, numericValue);
					if (!internalPagination.value) {
						internalPagination.value = {
							limit: 0,
							offset: safeOffset,
						};
						continue;
					}
					internalPagination.value.offset = safeOffset;
					continue;
				}
			}

			// Try to map parameter to search filter field, otherwise treat as extra parameter
			if (!setSearchFilterField(key, value)) {
				// Set key as extra parameter for custom search logic
				internalExtraParameters.value[key] = value;
			}
		}
	}
};

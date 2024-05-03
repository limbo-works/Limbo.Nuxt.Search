export const useLimboSearch = async (options = {}) => {
	const {
		searchKey = "",
		searchFilters,
		config = {},
		extraParameters = {},
		parameterOverwrites = {},
	} = options;

	//const emits = defineEmits(['init', 'update', 'error']);

	const defaultDataMergerMethod = (newData, oldData) => {
		if (
			newData &&
			oldData &&
			Array.isArray(newData) &&
			Array.isArray(oldData)
		) {
			return [...oldData, ...newData];
		}
		return newData;
	};
	const defaultGroupedDataMergerMethod = (newData, oldData) => {
		const compiledGroups = [];
		if (
			newData?.groups &&
			oldData?.groups &&
			Array.isArray(newData.groups) &&
			Array.isArray(oldData.groups)
		) {
			oldData.groups.forEach((group) => {
				const newGroup = newData.groups.find((newGroup) => {
					return newGroup.id === group.id;
				});
				if (newGroup) {
					newGroup.items = [...group.items, ...newGroup.items];
					compiledGroups.push(newGroup);
				} else {
					compiledGroups.push(group);
				}
			});
			return { ...newData, groups: compiledGroups };
		}
		return newData || JSON.parse(JSON.stringify(oldData));
	};

	const defaultLimit = 12;
	const defaultConfig = {
		callMethod: "GET", // { string } The method to use for the call
		enableLiveSearch: false, // { boolean|array } Can be an array of particular parameters triggering a live search or simply true or false
		immediateSearch: {
			useUrlQuery: true,
			ssr: true, // ssr: true will make the search run on the server side
		}, // { boolean|object } Can also be set to boolean value
		clearRouterHashOnSearch: false, // { boolean|object } Whether to clear the hash on search. If an object is used, the property "includeInitialSearch" to also clear for the first search, else that will be left out
		limit: { initial: defaultLimit, value: defaultLimit }, // { number|object } If a numeric limit is set, it will be used for both values - grouped paginations should be set with their ids (fx. limit: { 1: { initial: 18, value: 12 }, 2: { initial: 15, value: 6 } }).
		enableGroupedSearch: false, // { boolean } Make use of grouped pagination (l1, o1, l2, o2, (ie. l{id}, o{id}) etc.) instead of simply "limit" and "offset".
		groupParameter: "groups", // { string } When needing to "fetch more / all" we need a parameter to filter that.
		updateUrlQueryOnSearch: true, // { boolean } Allow the page's url to reflect the search
		updateVueRouteOnSearch: false, // { boolean|object } Allow the vue router to reflect the search - may cause issues if the page is keyed based off the query. /* NOT FULLY DONE YET (DON'T CURRENTLY RE-SEARCH): If an object is used, set "pushHistory" to make each individual search part of the browser history. */
		clearSearchDataOnError: true, // { boolean } When toggled to false, the data from the previous search will persist on error
		allowSearchFiltersMutation: false, // { boolean } Needs to be explicitly turned on!
		updateSearchFiltersOnBindingChange: true, // { boolean } Whether a change in the bound search filters should trigger a change in the internally used data
		persistentParameters: ["contextId"], // { array } Parameters that should always be present in a search (empty or not)
		hiddenParameters: ["siteId", "contextId", "pageId", "cultureId"], // { array } Parameters that should not be shown in the url.
		defaultParameterValues: {}, // { object } Default values for parameters - parameters will not be shown in the url if they have the same value as the default value
		// Data transformation methods
		searchResponseTransformerMethod: (val) => val, // { function } Method to transform the response data
		searchBodyTransformerMethod: (val) => val, // { function } Method to transform the searchBody data, ONLY used when callMethod is POST
		dataMergerMethod: defaultDataMergerMethod, // { function } Method to merge new data with old data
		dataOutputTransformerMethod: (val) => val, // { function } Method to transform the output data. Note that this method doesn't change the internally stored data, but only the data place in the bindings.
		searchDelay: 0, // { number } Delay in ms before the search is triggered
		urlFilterMapping: {}, // { object } Mapping for filters to url parameters, NOT FULLY IMPLEMENTED YET
	};

	const defaultSearchData = {
		data: null,
		facets: null,
		pagination: null,
		meta: null,
		misc: null,
		error: null,
	};
	const reservedParameters = ["limit", "offset", "total"];

	const lastRequestedUrl = ref(null);

	const searchData = useState(`searchData${searchKey}`, () =>
		JSON.parse(JSON.stringify(defaultSearchData))
	);

	const internalSearchFilters = ref(
		removeReservedParameters(searchFilters.value)
	);
	const searchFiltersClone = ref(
		removeReservedParameters(
			JSON.parse(JSON.stringify(searchFilters.value))
		)
	);
	const internalExtraParameters = ref({});
	const internalPagination = ref({});
	const requestTimeout = ref(null);

	const state = useState(`searchState${searchKey}`, () => ({
		isInitiated: false,
		isLoading: false,
		hasFetchedOnce: false,
		hasMoreItems: undefined,
		isAppend: false,
	}));
	const query = ref({
		parameters: null,
	});
	const latestResponse = ref(null);

	const compConfig = computed(() => {
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
		return filters.value.endpointUrl;
	});
	const fields = computed(() => {
		return filters.value.fields;
	});

	const searchFilterParameters = computed(() => {
		const fieldParameters =
			fields.value?.reduce((reducer, field) => {
				if (field.name) {
					if (Array.isArray(field.value)) {
						const item = field.value.find((item) => item.checked);
						if (item) {
							reducer[field.name] = item.value;
						}
					} else {
						reducer[field.name] = field.value;
					}
				}
				return reducer;
			}, {}) ?? {};
		return fieldParameters;
	});

	const pagination = computed(() => {
		if (compConfig.value.enableGroupedSearch) {
			return convertToParameterStyledPagination(internalPagination.value);
		}
		const pagination = { limit: 0, offset: 0 };
		const { limit, offset } = internalPagination.value ?? {};
		if (typeof limit !== "undefined") {
			pagination.limit = limit;
		}
		if (typeof offset !== "undefined") {
			pagination.offset = offset;
		}
		return pagination;
	});

	const watchedParameters = computed(() => {
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
		if (
			compConfig.value.enableGroupedSearch &&
			typeof internalExtraParameters.value[
				compConfig.value.groupParameter
			] !== "undefined"
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
		() => searchFilters.value,
		(newFilters) => {
			if (compConfig.value.updateSearchFiltersOnBindingChange) {
				internalSearchFilters.value =
					removeReservedParameters(newFilters);
				searchFiltersClone.value = removeReservedParameters(
					JSON.parse(JSON.stringify(newFilters))
				);
			}
		},
		{ deep: true }
	);

	watch(
		() => watchedParameters,
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

	function fetchMore(
		amount = (compConfig.value.limit?.value ??
			parseInt(compConfig.value.limit)) ||
			defaultLimit
	) {
		if (state.value.isLoading || !state.value.hasMoreItems) {
			return;
		}
		internalPagination.value.offset += internalPagination.value.limit;
		requestSearch({ append: true });
	}
	function fetchMoreGroup(id, amount) {
		if (!searchData?.value?.error && state.value.hasMoreItems?.[id]) {
			// Make sure that we don't fetch the other groups as well
			internalExtraParameters.value[compConfig.value.groupParameter] = id;
			// Get the amount if none is set
			if (typeof amount === "undefined") {
				amount =
					(compConfig.value.limit[id]?.value ??
						parseInt(compConfig.value.limit[id])) ||
					defaultLimit;
			}
			// Fetch
			const internal = internalPagination.value[id] || {};
			internal.offset =
				+searchData?.value?.pagination?.[id]?.offset +
				+searchData?.value?.pagination?.[id]?.limit;
			internal.limit = +amount;
			internalPagination.value[id] = internal;
			requestSearch({ append: true });
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

	function fetchAllGroup(id) {
		if (!searchData?.value?.error && state.value.hasMoreItems?.[id]) {
			// Make sure that we don't fetch the other groups as well
			internalExtraParameters.value[compConfig.value.groupParameter] = id;

			// Fetch
			const internal = internalPagination.value[id] || {};
			internal.offset =
				+searchData?.value?.pagination?.[id]?.offset +
				+searchData?.value?.pagination?.[id]?.limit;
			internal.limit =
				+searchData?.value?.pagination?.[id]?.total - internal.offset;
			internalPagination.value[id] = internal;
			requestSearch({ append: true });
		}
	}

	async function requestSearch(options) {
		const { delay, append } = {
			delay: compConfig.value.searchDelay,
			append: false,
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
		// The search requesting
		const searchRequest = async () => {
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
			if (compConfig.value.callMethod === "POST") {
				lastRequestedUrl.value = endpointUrl.value;
			}
			state.value.isAppend = !!append;
			const currentlyRequestedUrl = lastRequestedUrl.value;
			const data = await $fetch(lastRequestedUrl.value, {
				method: compConfig.value.callMethod,
				body:
					compConfig.value.callMethod === "POST"
						? compConfig.value.searchBodyTransformerMethod(params)
						: null,
				onResponseError({ request, response, options }) {
					if (!requestTimeout.value) {
						searchData.value = {
							...defaultSearchData,
							...searchData.value,
						};
						state.value.hasFetchedOnce = true;
						if (compConfig.value.clearSearchDataOnError) {
							state.value.hasMoreItems = null;
							Object.assign(searchData.value, defaultSearchData);
							latestResponse.value = null;
						} else {
							if (compConfig.value.enableGroupedSearch) {
								for (const key in state.value.hasMoreItems) {
									state.value.hasMoreItems[key] = false;
								}
							} else {
								state.value.hasMoreItems = false;
							}
						}
						searchData.value.error = response._data;
						state.value.isLoading = false;
						console.log("error", response._data);
					}
				},
			});

			if (lastRequestedUrl.value != currentlyRequestedUrl) {
				return;
			}
			if (!requestTimeout.value) {
				state.value.hasFetchedOnce = true;
				let response =
					compConfig.value.searchResponseTransformerMethod?.(data) ??
					data;
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
					? compConfig.value.dataMergerMethod?.(
							newData,
							JSON.parse(JSON.stringify(searchData.value.data))
					  ) ?? newData
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
						if ("id" in group) {
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
			}
		};
		// Run on client or server
		if (typeof window !== "undefined" && delay > 0) {
			await new Promise((resolve) => {
				window.clearTimeout(requestTimeout.value);
				requestTimeout.value = window.setTimeout(resolve, delay);
			});
		}
		await searchRequest();
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
				/* eslint-disable-next-line */
				(key in (compConfig.value.defaultParameterValues || {}) &&
					value != compConfig.value.defaultParameterValues?.[key]) ||
				isPersistent
			) {
				array.push(`${key}=${value ?? ""}`);
			}
		}
		return array.join("&");
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

	const router = useRouter();

	function setUrlQuery(query = getSerializedParams(), clearHash = false) {
		const array = query.split("&").filter((item) => {
			const key = item.split("=").shift();
			let value = item.split("=").pop();
			// TODO: implement urlFilterMapping

			if (
				key === compConfig.value.groupParameter &&
				hideGroupsParameter.value
			) {
				return false;
			}

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

			if (
				key in defaultParameterValues &&
				String(defaultParameterValues[key]) === (value ?? "")
			) {
				return false;
			}
			return !compConfig.value.hiddenParameters?.includes?.(key);
		});
		const transformedArray = array.map((item) => {
			const key = item.split("=").shift();
			let value = item.split("=").pop();
			if (key in compConfig.value.urlFilterMapping) {
				const mappedKey = compConfig.value.urlFilterMapping[key];
				if (value in mappedKey) {
					value = mappedKey[value];
				}
			}
			return `${key}=${value}`;
		});

		const url =
			[route.path, transformedArray.join("&")].filter(Boolean).join("?") +
			(clearHash
				? ""
				: typeof window !== "undefined"
				? window.location.hash
				: route.hash);

		const oldUrl =
			typeof window === "undefined"
				? route.fullPath
				: [
						window.location.pathname,
						window.location.search,
						window.location.hash,
				  ]
						.filter(Boolean)
						.join("");
		typeof window !== "undefined" &&
			compConfig.value.updateUrlQueryOnSearch &&
			window.history.replaceState(window.history.state, "", url);

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
			typeof window !== "undefined" &&
			compConfig.value.updateVueRouteOnSearch &&
			compConfig.value.updateUrlQueryOnSearch
		) {
			window.history.replaceState(window.history.state, "", oldUrl);
		}
	}

	// Check if initiated
	if (!compConfig.value.immediateSearch) {
		resetPagination();
		state.value.isInitiated = true;
	}

	if (
		compConfig.value.immediateSearch?.ssr &&
		compConfig.value.immediateSearch
	) {
		resetPagination();
		if (compConfig.value.immediateSearch?.useUrlQuery) {
			mixParametersFromUrl();
			if (compConfig.value.enableGroupedSearch) {
				// Grouped pagination
				for (const key in internalPagination.value) {
					const value = internalPagination.value[key];
					if (value.limit) {
						value.limit = +value.limit;
					}
					if (value.offset) {
						value.limit = +value.limit + +value.offset;

						value.offset = 0;
					}
				}
			} else {
				// Ordinary pagination
				if (internalPagination.value.limit) {
					internalPagination.value.limit =
						+internalPagination.value.limit;
				}
				if (internalPagination.value.offset) {
					internalPagination.value.limit =
						+internalPagination.value.limit +
						+internalPagination.value.offset;

					internalPagination.value.offset = 0;
				}
			}
		}
		await requestSearch({ delay: 0 });
	}

	return reactive({
		searchData,
		state,
		query,
		requestSearch,
		fetchMore: compConfig.value.enableGroupedSearch
			? fetchMoreGroup
			: fetchMore,
		fetchAll: compConfig.value.enableGroupedSearch
			? fetchAllGroup
			: fetchAll,
		submit,
		setUrlQuery,
		resetPagination,
		getSerializedParams,
		lastRequestedUrl,
		latestResponse,
	});

	// Internal helper functions
	function removeReservedParameters(filters) {
		const newFilters = { ...filters };
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
				if (typeof value?.limit !== "undefined") {
					newPagination[`l${key}`] = value.limit;
				}
				if (typeof value?.offset !== "undefined") {
					newPagination[`o${key}`] = value.offset;
				}
			}
			return newPagination;
		}
		return pagination;
	}

	function setSearchFilterField(key, value) {
		const { fields } = filters.value;
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
				field.value = value ?? "";
			}
			return true;
		}
		return false; // Return false if the field does not exist
	}

	function mixParametersFromUrl() {
		const { query } = route;
		for (const key in query) {
			const value = query[key];

			// Set key as pagination
			if (compConfig.value.enableGroupedSearch) {
				const array = key.toLowerCase().split("");
				const firstLetter = array.shift();
				const remainder = array.join("");
				if (
					(firstLetter === "o" || firstLetter === "l") &&
					remainder === String(parseInt(remainder))
				) {
					const object = Object.assign(
						{ limit: 0, offset: 0 },
						internalPagination?.value?.[remainder]
					);
					if (firstLetter === "o") {
						object.offset = parseInt(value);
					}
					if (firstLetter === "l") {
						object.limit = parseInt(value);
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
				if (key.toLowerCase() === "limit") {
					if (!internalPagination.value) {
						internalPagination.value = {
							limit: parseInt(value),
							offset: 0,
						};
						continue;
					}
					internalPagination.value.limit = parseInt(value);
					continue;
				} else if (key.toLowerCase() === "offset") {
					if (!internalPagination.value) {
						internalPagination.value = {
							limit: 0,
							offset: parseInt(value),
						};
						continue;
					}
					internalPagination.value.offset = parseInt(value);
					continue;
				}
			}

			// Set key as search filter field
			if (!setSearchFilterField(key, value)) {
				// Set key as extra parameter
				internalExtraParameters.value[key] = value;
			}
		}
	}
};

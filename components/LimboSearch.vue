<template>
	<Component
		v-if="tag"
		:is="tag"
		class="c-limbo-search"
		v-bind="$attrs"
	>
		<slot v-bind="bindings"></slot>
	</Component>
	<slot
		v-else
		v-bind="bindings"
	></slot>
</template>

<script>
/**
 * Developer notes:
 * Currently accepts checkbox/selects with singular
 * values. The component will need a tweak if
 * multi-values shall be allowed.
 */
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
	enableLiveSearch: false, // { boolean|array } Can be an array of particular parameters triggering a live search or simply true or false
	immediateSearch: { useUrlQuery: true, /* ssr: true - not fully developed yet, dont use! */ }, // { boolean|object } Can also be set to boolean value
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
	// Data transformation methods
	searchResponseTransformerMethod: (val) => val, // { function } Method to transform the response data
	dataMergerMethod: defaultDataMergerMethod, // { function } Method to merge new data with old data
	dataOutputTransformerMethod: (val) => val, // { function } Method to transform the output data. Note that this method doesn't change the internally stored data, but only the data place in the bindings.
	searchDelay: 0, // { number } Delay in ms before the search is triggered
};
const defaultSearchData = {
	data: null,
	facets: null,
	pagination: null,
	meta: null,
	misc: null,
	error: null,
};
const reservedParameters = ['limit', 'offset', 'total'];
export default {
	name: 'LimboSearch',
	inheritAttrs: false,

	props: {
		tag: {
			type: String,
			default: 'div',
		},
		searchFilters: {
			type: Object,
			required: true,
			validator(obj) {
				return (
					typeof obj.endpointUrl === 'string' &&
					Array.isArray(obj.fields)
				);
			},
		},
		extraParameters: {
			type: Object,
			default: () => ({}),
		},
		// Forced parameters will overwrite all other parameters (including parameters set from the url)
		parameterOverwrites: {
			type: Object,
			default: () => ({}),
		},
		config: {
			type: Object,
			default: () => ({}),
		},
	},

	data() {
		return {
			lastRequestedUrl: null,
			searchData: JSON.parse(JSON.stringify(defaultSearchData)),
			internalSearchFilters: this.removeReservedParameters(
				this.searchFilters
			),
			searchFiltersClone: this.removeReservedParameters(
				JSON.parse(JSON.stringify(this.searchFilters))
			),
			internalExtraParameters: {}, // Only ever set through url and grouped "fetch more/all"!
			internalPagination: {},
			requestTimeout: null,
			state: {
				isInitiated: false,
				isLoading: false,
				hasFetchedOnce: false,
				hasMoreItems: undefined,
				isAppend: false,
			},
			query: {
				parameters: null,
			},
			latestResponse: null,
		};
	},

	computed: {
		compConfig() {
			const _return = { ...defaultConfig, ...this.config };
			if (
				_return.dataMergerMethod === defaultDataMergerMethod &&
				_return.enableGroupedSearch
			) {
				_return.dataMergerMethod = defaultGroupedDataMergerMethod;
			}
			return _return;
		},
		bindings() {
			return {
				state: this.state,
				query: this.query,
				...this.searchData,
				data: this.searchData.data
					? this.compConfig.dataOutputTransformerMethod(
							this.searchData.data,
							this.latestResponse
					  )
					: null,
				action: {
					submit: this.submit,
					fetchMore: this.compConfig.enableGroupedSearch
						? this.fetchMoreGroup
						: this.fetchMore,
					fetchAll: this.compConfig.enableGroupedSearch
						? this.fetchAllGroup
						: this.fetchAll,
				},
			};
		},
		filters() {
			if (this.compConfig.allowSearchFiltersMutation) {
				return this.internalSearchFilters;
			}
			return this.searchFiltersClone;
		},
		endpointUrl() {
			return this.filters.endpointUrl;
		},
		fields() {
			return this.filters.fields;
		},
		searchFilterParameters() {
			const fieldParameters =
				this.fields?.reduce((reducer, field) => {
					if (field.name) {
						if (Array.isArray(field.value)) {
							const item = field.value.find(
								(item) => item.checked
							);
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
		},
		pagination() {
			if (this.compConfig.enableGroupedSearch) {
				return this.convertToParameterStyledPagination(
					this.internalPagination
				);
			}
			const pagination = { limit: 0, offset: 0 };
			const { limit, offset } = this.internalPagination ?? {};
			if (typeof limit !== 'undefined') {
				pagination.limit = limit;
			}
			if (typeof offset !== 'undefined') {
				pagination.offset = offset;
			}
			return pagination;
		},
		watchedParameters() {
			const parameters = {
				...this.extraParameters,
				...this.searchFilterParameters,
			};
			for (const key in this.parameterOverwrites) {
				parameters[key] = this.parameterOverwrites[key];
			}
			return parameters;
		},
		parameters() {
			const parameters = {
				...this.extraParameters,
				...this.internalExtraParameters,
				...this.searchFilterParameters,
				...this.pagination,
				...this.parameterOverwrites,
			};
			for (const name in parameters) {
				const value = parameters[name];
				if (
					value == null &&
					!this.compConfig.persistentParameters?.includes?.(name)
				) {
					delete parameters[name];
				}
			}
			return parameters;
		},
		hideGroupsParameter() {
			if (
				this.compConfig.enableGroupedSearch &&
				typeof this.internalExtraParameters[
					this.compConfig.groupParameter
				] !== 'undefined'
			) {
				const parameters = {
					...this.searchFilterParameters,
					...this.pagination,
					...this.parameterOverwrites,
				};
				for (const name in parameters) {
					const value = parameters[name];
					if (
						name === this.compConfig.groupParameter &&
						(value ||
							this.compConfig.persistentParameters?.includes?.(
								name
							))
					) {
						return false;
					}
				}
				return true;
			}
			return false;
		},
	},

	watch: {
		'state.isInitiated': {
			handler(state) {
				if (state) {
					this.$emit('init', true);
				}
			},
      immediate: true,
		},
		searchFilters: {
			deep: true,
			handler(val) {
				if (this.compConfig.updateSearchFiltersOnBindingChange) {
					this.internalSearchFilters = this.removeReservedParameters(val);

					this.searchFiltersClone = this.removeReservedParameters(
						JSON.parse(JSON.stringify(val))
					);
				}
			},
		},
		watchedParameters: {
			deep: true,
			handler(newParams, oldParams) {
				const { enableLiveSearch } = this.compConfig;
				if (enableLiveSearch) {
					if (!Array.isArray(enableLiveSearch)) {
						if (
							this.state.hasFetchedOnce &&
							JSON.stringify(newParams) !==
								JSON.stringify(oldParams)
						) {
							this.submit();
						}
					} else if (this.state.hasFetchedOnce) {
						for (let i = 0; i < enableLiveSearch.length; i++) {
							const key = enableLiveSearch[i];
							if (newParams[key] !== oldParams[key]) {
								this.submit();
								break;
							}
						}
					}
				}
			},
		},
	},

	async created() {
		// Make an initiary search
		if ((typeof window !== 'undefined' || this.compConfig.immediateSearch?.ssr) && this.compConfig.immediateSearch) {
			this.resetPagination();
			if (this.compConfig.immediateSearch?.useUrlQuery) {
				this.mixParametersFromUrl();
				if (this.compConfig.enableGroupedSearch) {
					// Grouped pagination
					for (const key in this.internalPagination) {
						const value = this.internalPagination[key];
						if (value.limit) {
							value.limit = +value.limit
						}
						if (value.offset) {
							value.limit = +value.limit + +value.offset

							value.offset = 0
						}
					}
				} else {
					// Ordinary pagination
					if (this.internalPagination.limit) {
						this.internalPagination.limit = +this.internalPagination.limit;

					}
					if (this.internalPagination.offset) {
						this.internalPagination.limit = +this.internalPagination.limit + +this.internalPagination.offset;

						this.internalPagination.offset = 0;
					}
				}
			}
			await this.requestSearch({ delay: 0 });
		}
		// Check if initiated
		if (!this.compConfig.immediateSearch) {
			this.state.isInitiated = true;
			this.resetPagination();
		}
	},

	methods: {
		// Methods to call from the outside
		submit() {
			// Submit a whole new search
			this.internalExtraParameters = {};
			this.resetPagination();
			this.requestSearch();
		},
		fetchMore(
			amount = (this.compConfig.limit?.value ??
				parseInt(this.compConfig.limit)) ||
				defaultLimit
		) {
			if (!this.searchData?.error && this.state.hasMoreItems) {
				this.internalPagination.offset =
					+this.searchData?.pagination?.offset +
					+this.searchData?.pagination?.limit;
				this.internalPagination.limit = +amount;
				this.requestSearch({ append: true });
			}
		},
		fetchMoreGroup(id, amount) {
			if (!this.searchData?.error && this.state.hasMoreItems?.[id]) {
				// Make sure that we don't fetch the other groups as well
				this.internalExtraParameters[this.compConfig.groupParameter] = id;
				// Get the amount if none is set
				if (typeof amount === 'undefined') {
					amount =
						(this.compConfig.limit[id]?.value ??
							parseInt(this.compConfig.limit[id])) ||
						defaultLimit;
				}
				// Fetch
				const internal = this.internalPagination[id] || {};
				internal.offset =
					+this.searchData?.pagination?.[id]?.offset +
					+this.searchData?.pagination?.[id]?.limit;
				internal.limit = +amount;
				this.internalPagination[id] = internal;
				this.requestSearch({ append: true });
			}
		},
		fetchAll() {
			if (!this.searchData?.error && this.state.hasMoreItems) {
				this.internalPagination.offset =
					+this.searchData?.pagination?.offset +
					+this.searchData?.pagination?.limit;
				this.internalPagination.limit =
					+this.searchData?.pagination?.total -
					this.internalPagination.offset;
				this.requestSearch({ append: true });
			}
		},
		fetchAllGroup(id) {
			if (!this.searchData?.error && this.state.hasMoreItems?.[id]) {
				// Make sure that we don't fetch the other groups as well
				this.internalExtraParameters[this.compConfig.groupParameter] = id;

				// Fetch
				const internal = this.internalPagination[id] || {};
				internal.offset =
					+this.searchData?.pagination?.[id]?.offset +
					+this.searchData?.pagination?.[id]?.limit;
				internal.limit =
					+this.searchData?.pagination?.[id]?.total - internal.offset;
				this.internalPagination[id] = internal;
				this.requestSearch({ append: true });
			}
		},
		// Where the magic happens
		async requestSearch(options) {
			const { delay, append } = {
				delay: this.compConfig.searchDelay,
				append: false,
				...options,
			};

      let clearHash = false;
      if (
        !append && this.$route.hash &&
        this.compConfig.clearRouterHashOnSearch && (
          !this.compConfig.immediateSearch ||
          this.state.hasFetchedOnce ||
          this.compConfig.clearRouterHashOnSearch?.includeInitialSearch
        )
      ) {
        clearHash = true;
      }

			this.state.isInitiated = true;
			this.state.isLoading = true;

      // The search requesting
      const searchRequest = async () => {
				const params = {
					...(append
						? {
								...this.query.parameters,
								...this.internalExtraParameters,
								...this.convertToParameterStyledPagination(
									this.internalPagination
								),
						  }
						: this.parameters),
				};
				const serializedParams = this.getSerializedParams(params);
				if (
					this.compConfig.updateUrlQueryOnSearch ||
					this.compConfig.updateVueRouteOnSearch
				) {
					this.setUrlQuery(serializedParams, clearHash);
				}

				this.requestTimeout = null;
				this.lastRequestedUrl = `${this.endpointUrl}?${serializedParams}`;
				this.state.isAppend = !!append;
				this.$emit('update', JSON.parse(JSON.stringify(this.bindings)));

        const currentlyRequestedUrl = this.lastRequestedUrl;
				await $fetch(this.lastRequestedUrl)
					.then((response) => {
						// eslint-disable-next-line
            if (this.lastRequestedUrl != currentlyRequestedUrl) {
							return;
						}

						if (!this.requestTimeout) {
							this.state.hasFetchedOnce = true;
							response =
								this.compConfig.searchResponseTransformerMethod?.(
									response
								) ?? response;
							this.latestResponse = response; // save for later
							// On append, merge the paginations
							if (
								append &&
								this.searchData.pagination &&
								response
							) {
								if (response.pagination) {
									response.pagination = {
										...this.searchData.pagination,
										...response.pagination,
									};
								} else {
									response.pagination = {
										...this.searchData.pagination,
									};
								}
							} // Should probably merge facets and misc as well... A thing for the future?
							// Set the everything
							this.searchData = {
								...defaultSearchData,
								...this.searchData,
							};
							this.searchData.error = null;

							const newData = this.compConfig.enableGroupedSearch
								? response
								: response?.data;
							this.searchData.data = append // Data is getting merged
								? this.compConfig.dataMergerMethod?.(
										newData,
										JSON.parse(
											JSON.stringify(this.searchData.data)
										)
								  ) ?? newData
								: newData;

							this.searchData.facets = response?.facets;
							this.searchData.meta = response?.meta;
							this.searchData.misc = response?.misc;
							this.query.parameters = { ...this.parameters };
							if (this.compConfig.enableGroupedSearch) {
								// Group pagination
								this.state.hasMoreItems = {};
								this.searchData.pagination =
									response?.pagination;

								if (!this.searchData.pagination) {
									this.searchData.pagination = {};
								}
								response?.groups?.forEach((group) => {
									if ('id' in group) {
										this.searchData.pagination[group.id] = {
											limit: group.limit || 0,
											offset: group.offset || 0,
											total: group.total || 0,
										};

									}
								});

								for (const key in this.searchData.pagination) {
									const value = Object.assign(
										{ limit: 0, offset: 0, total: 0 },
										this.searchData.pagination[key]
									);
									this.searchData.pagination[key] = value;

									this.internalPagination[key] = {
										...value,
									};

									this.state.hasMoreItems[key] = value.limit + value.offset < value.total;

								}
							} else {
								// Ordinary pagination
								this.searchData.pagination = Object.assign(
									{ limit: 0, offset: 0, total: 0 },
									response?.pagination
								);
								this.internalPagination.limit = this.searchData.pagination.limit;

								this.internalPagination.offset = this.searchData.pagination.offset;

								this.state.hasMoreItems =
									this.searchData.pagination.limit +
										this.searchData.pagination.offset <
									this.searchData.pagination.total;
							}
							this.state.isLoading = false;
							this.searchData = this.searchData;
							this.$emit(
								'update',
								JSON.parse(JSON.stringify(this.bindings))
							);
						}
					})
					.catch((error) => {
						if (!this.requestTimeout) {
							this.searchData = {
								...defaultSearchData,
								...this.searchData,
							};
							this.state.hasFetchedOnce = true;
							if (this.compConfig.clearSearchDataOnError) {
								this.state.hasMoreItems = null;
								Object.assign(
									this.searchData,
									defaultSearchData
								);
								this.latestResponse = null;
							} else {
								if (this.compConfig.enableGroupedSearch) {
									for (const key in this.state.hasMoreItems) {
										this.state.hasMoreItems[key] = false;
									}
								} else {
									this.state.hasMoreItems = false;
								}
							}
							this.searchData.error = error.response;
							this.state.isLoading = false;
							this.searchData = this.searchData
							this.$emit(
								'update',
								JSON.parse(JSON.stringify(this.bindings))
							);
							this.$emit('error', error.response);
						}
					});
			}

      // Run on client or server
      if (typeof window !== 'undefined' && delay > 0) {
        await new Promise((resolve) => {
          window.clearTimeout(this.requestTimeout);
          this.requestTimeout = window.setTimeout(resolve, delay);
        });
      }
      await searchRequest();
		},
		// Serialization of parameters
		getSerializedParams(parameters = this.parameters) {
			const array = [];
			for (const key in parameters) {
				const value = parameters[key];
				const isPersistent =
					this.compConfig?.persistentParameters?.includes?.(key);
				if (Array.isArray(value)) {
					const item = parameters?.find?.(
						(item) => item.value === value
					);
					if ((item && item.value) || isPersistent) {
						array.push(`${key}=${item?.value}`);
					}
				} else if (
					value ||
					/* eslint-disable-next-line eqeqeq */
					(key in (this.compConfig.defaultParameterValues || {}) && value != this.compConfig.defaultParameterValues?.[key]) ||
					isPersistent
				) {
					array.push(`${key}=${value ?? ''}`);
				}
			}
			return array.join('&');
		},
		// Mix the url parameters into the data
		mixParametersFromUrl() {
			const { query } = this.$route;
			for (const key in query) {
				const value = query[key];
				// Set key as pagination
				if (this.compConfig.enableGroupedSearch) {
					const array = key.toLowerCase().split('');
					const firstLetter = array.shift();
					const remainder = array.join('');
					if (
						(firstLetter === 'o' || firstLetter === 'l') &&
						remainder === String(parseInt(remainder))
					) {
						const object = Object.assign(
							{ limit: 0, offset: 0 },
							this.internalPagination?.[remainder]
						);
						if (firstLetter === 'o') {
							object.offset = parseInt(value);
						}
						if (firstLetter === 'l') {
							object.limit = parseInt(value);
						}
						this.internalPagination = Object.assign(this.internalPagination, {
							[remainder]: object,
						});
						continue;
					}
				} else {
					if (key.toLowerCase() === 'limit') {
						if (!this.internalPagination) {
							this.internalPagination = {
								limit: parseInt(value),
								offset: 0,
							};
							continue;
						}
						this.internalPagination.limit = parseInt(value);
						continue;
					} else if (key.toLowerCase() === 'offset') {
						if (!this.internalPagination) {
							this.internalPagination = {
								limit: 0,
								offset: parseInt(value),
							};
							continue;
						}
						this.internalPagination.offset = parseInt(value)
						continue;
					}
				}

				// Set key as search filter field
				if (!this.setSearchFilterField(key, value)) {
					// Set key as extra parameter
					this.internalExtraParameters[key] = value;
				}
			}
		},
		// Set the value of a field in the search filter
		setSearchFilterField(key, value) {
			const { fields } = this.filters;
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
		},
		resetPagination() {
			if (!this.internalPagination) {
				this.internalPagination = {};
			}
			if (this.compConfig.enableGroupedSearch) {
				// Grouped pagination
				for (const key in this.compConfig.limit) {
					if (key === String(parseInt(key))) {
						const value = this.internalPagination[key] || {};
						this.internalPagination[key] = value;
					}
				}
				for (const key in this.internalPagination) {
					const value = this.internalPagination[key];
					value.limit =
						(this.compConfig.limit[key]?.initial ??
							this.compConfig.limit[key]?.value ??
							this.compConfig.limit[key]) ||
						defaultLimit;
					value.offset = 0;
				}
			} else {
				// Ordinary pagination
				this.internalPagination.limit =
					(this.compConfig.limit?.initial ??
						this.compConfig.limit?.value ??
						this.compConfig.limit) ||
					defaultLimit;
				this.internalPagination.offset = 0;
			}
		},
		// Update the url query
		setUrlQuery(query = this.getSerializedParams(), clearHash = false) {
			const array = query.split('&').filter((item) => {
				const key = item.split('=').shift();
				const value = item.split('=').pop();

				if (
					key === this.compConfig.groupParameter &&
					this.hideGroupsParameter
				) {
					return false;
				}

				const initialLimit =
					(this.compConfig.limit?.initial ??
						this.compConfig.limit?.value ??
						this.compConfig.limit) ||
					defaultLimit;
				const defaultParameterValues = {
					limit: initialLimit,
					offset: 0,
					...this.compConfig.defaultParameterValues,
				};
				if (!(key in defaultParameterValues)) {
					if (key === `l${String(parseInt(key.substring(1)))}`) {
						const id = key.substring(1);
						defaultParameterValues[`l${id}`] =
							(this.compConfig.limit[id]?.initial ??
								this.compConfig.limit[id]?.value ??
								this.compConfig.limit[id]) ||
							defaultLimit;
					}
					if (key === `o${String(parseInt(key.substring(1)))}`) {
						defaultParameterValues[key] = 0;
					}
				}

				if (
					key in defaultParameterValues &&
					String(defaultParameterValues[key]) === (value ?? '')
				) {
					return false;
				}
				return !this.compConfig.hiddenParameters?.includes?.(key);
			});
			const url =
        [this.$route.path, array.join('&')]
					.filter(Boolean)
					.join('?') + (clearHash ? '' : (typeof window !== 'undefined' ? window.location.hash : this.$route.hash));

			const oldUrl = typeof window === 'undefined' ? this.$route.fullPath : [
				window.location.pathname,
				window.location.search,
				window.location.hash,
			]
				.filter(Boolean)
				.join('');
      typeof window !== 'undefined' && this.compConfig.updateUrlQueryOnSearch &&
				window.history.replaceState(null, '', url);

			if (
				this.compConfig.updateVueRouteOnSearch &&
				decodeURIComponent(this.$route.fullPath) !==
					decodeURIComponent(url)
			) {
        this.compConfig.updateVueRouteOnSearch?.pushHistory
          ? this.$router.push(url)
          : this.$router.replace(url);
			}

			// Edge case, but might as well handle it
			if (
        typeof window !== 'undefined' &&
				this.compConfig.updateVueRouteOnSearch &&
				this.compConfig.updateUrlQueryOnSearch
			) {
				window.history.replaceState(null, '', oldUrl);
			}
		},
		// Remove reserved filters
		removeReservedParameters(filters) {
			const newFilters = { ...filters };
			if (filters?.fields && Array.isArray(filters.fields)) {
				newFilters.fields = filters.fields.filter(
					(field) =>
						!reservedParameters.includes(field.name.toLowerCase())
				);
			}
			return newFilters;
		},
		convertToParameterStyledPagination(pagination) {
			if (this.compConfig.enableGroupedSearch) {
				const newPagination = {};
				for (const key in pagination) {
					const value = pagination[key];
					if (typeof value?.limit ?? undefined !== 'undefined') {
						newPagination[`l${key}`] = value.limit;
					}
					if (typeof value?.offset ?? undefined !== 'undefined') {
						newPagination[`o${key}`] = value.offset;
					}
				}
				return newPagination;
			}
			return pagination;
		},
	},
};
</script>

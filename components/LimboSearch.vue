<template>
	<Component :is="tag" v-if="tag" class="c-limbo-search">
		<slot v-bind="bindings"></slot>
	</Component>
	<slot v-else v-bind="bindings"></slot>
</template>

<script setup>
const emits = defineEmits(['init', 'update', 'error']);

const props = defineProps({
	tag: {
		type: String,
		default: 'div',
	},
	searchFilters: {
		type: Object,
		required: true,
		validator(obj) {
			return (
				typeof obj.endpointUrl === 'string' && Array.isArray(obj.fields)
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
	searchKey: {
		type: String,
		default: '',
	},
});

defineExpose({
	// Data
	get state() {
		return limboSearch.state;
	},
	get query() {
		return limboSearch.query;
	},
	get data() {
		return limboSearch.searchData?.data;
	},
	get lastRequestedUrl() {
		return limboSearch.lastRequestedUrl;
	},
	get latestResponse() {
		return limboSearch.latestResponse;
	},
	get watchedParameters() {
		return limboSearch.watchedParameters;
	},

	// Methods
	submit,
	get fetchMore() {
		return limboSearch.fetchMore;
	},
	get fetchAll() {
		return limboSearch.fetchAll;
	},
	get setUrlQuery() {
		return limboSearch.setUrlQuery;
	},
	get resetPagination() {
		return limboSearch.resetPagination;
	},
	get getSerializedParams() {
		return limboSearch.getSerializedParams;
	},

	// Instance
	get composableInstance() {
		return limboSearch;
	},
});

const bindings = computed(() => {
	return {
		state: limboSearch.state,
		query: limboSearch.query,
		data: limboSearch.searchData?.data,
		lastRequestedUrl: limboSearch.lastRequestedUrl,
		latestResponse: limboSearch.latestResponse,
		action: {
			submit: limboSearch.submit,
			fetchMore: limboSearch.fetchMore,
			fetchAll: limboSearch.fetchAll,
			setUrlQuery: limboSearch.setUrlQuery,
			resetPagination: limboSearch.resetPagination,
			getSerializedParams: limboSearch.getSerializedParams,
		},
	};
});

const filters = toRef(props, 'searchFilters');
const id = useId();

const limboSearch = await useLimboSearch({
	searchKey: props.searchKey ? props.searchKey : id,
	searchFilters: filters,
	config: props.config,
	extraParameters: props.extraParameters,
	parameterOverwrites: props.parameterOverwrites,
});

watch(
	() => limboSearch.state.isInitiated,
	(isInitiated) => {
		if (isInitiated) {
			emits('init', true);
		}
	}
);

// can we get the functions from the limboSearch object directly without adding them here..
function submit() {
	emits('update', true);
	limboSearch?.submit();
}
</script>

<template>
	<div style="padding: 40px">
		<h1>Hello World!</h1>
		<input v-model="filters.fields[1].value" @change="submitSearch" />
		<a
			:href="item.url"
			v-for="item in limboSearch.searchData?.data"
			:key="item.id"
		>
			<div style="padding: 20px; font-size: 2em">
				{{ item.title }}
			</div>
			<div style="padding: 0 20px 20px">{{ item.teaser }}</div>
		</a>
		<div
			v-if="
				limboSearch.searchData?.pagination?.total -
					limboSearch.searchData?.pagination?.limit -
					limboSearch.searchData?.pagination?.offset >
				0
			"
			class="flex justify-center"
		>
			<button
				@click="limboSearch.fetchMore()"
				class="mt-60 bg-purple text-white spa-link cursor-pointer flex items-center justify-center py-20 px-48 text-md hover:bg-purple-light transition duration-200 ease-smooth-line spa-link--prefetched"
			>
				<!-- eslint-disable -->
				<span slot="label">Vis flere</span>
				<!-- eslint-enable -->
			</button>
		</div>
	</div>
</template>

<script setup>
const route = useRoute();

const filters = ref({
	endpointUrl: "https://www.jammerbugt.dk/api/jobs/search/",
	fields: [
		{ name: "contextId", value: "1588" },
		{ name: "text", value: "" },
	],
});

const limboSearch = await useLimboSearch({
	searchKey: route.path,

	searchFilters: filters.value,
	config: {
		callMethod: "GET",
		allowSearchFiltersMutation: true,
		updateVueRouteOnSearch: true,
		limit: 3,
		immediateSearch: { useUrlQuery: true, ssr: true },
		// searchBodyTransformerMethod: () => ({
		// 	page: { name: "page", value: page.value },
		// 	...props.searchFilters.fieldByName,
		// }),
		// hiddenParameters: [
		// 	"siteId",
		// 	"contextId",
		// 	"pageId",
		// 	"culture",
		// 	"hitsPerPage",
		// 	"sorting",
		// 	"attributesToRetrieve",
		// 	"filters.allowedArchives",
		// 	"parentId",
		// 	"filters.allowedSites",
		// ],
	},
});

function submitSearch() {
	console.log("hello");
	limboSearch?.submit();
}
</script>

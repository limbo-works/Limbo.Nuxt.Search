<template>
  <div>
    Hello World!
	<LimboSearch
		:search-filters="{
			endpointUrl: 'https://www.jammerbugt.dk/api/jobs/search/',
			fields: [{name: 'contextId', value: '1588'}, {name: 'text', value: ''}, {name:'limit', value: '16'}],
		}"
		#default="{ data, pagination, action }"
	>
		<template v-if="data">
			<pre>{{ pagination }}</pre>
			<pre>{{ data }}</pre>
			<div
				v-if="
					pagination.total -
						pagination.limit -
						pagination.offset >
						0
				"
				class="flex justify-center"
			>
				<button
					@click="action.fetchMore()"
					class="mt-60 bg-purple text-white spa-link cursor-pointer flex items-center justify-center py-20 px-48 text-md hover:bg-purple-light transition duration-200 ease-smooth-line spa-link--prefetched"
				>
					<!-- eslint-disable -->
					<span slot="label">Vis flere</span>
					<!-- eslint-enable -->
				</button>
			</div>
		</template>
	</LimboSearch>
  </div>
</template>

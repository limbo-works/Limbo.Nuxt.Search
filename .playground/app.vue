<template>
  <div>
    Hello World!
	<LimboSearch :search-filters="{
			endpointUrl: 'https://www.slagelse.dk/api/news/search/',
			fields: [{name: 'contextId', value: '1248'}, {name: 'text', value: 'test'}, {name:'limit', value: '16'}],
		}"
		#default="{ data, pagination }"
	>
		<pre>{{ data }}</pre>
		<pre>{{ pagination }}</pre>

	</LimboSearch>
  </div>
</template>

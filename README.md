# `LimboSearch`

Vue wrapper component for handling the searching actions on list/search pages. Handles both "simple lists" where the output of the search is an array with pagination, but also "grouped lists" where multiple paginations exist for multiple groups.

* Simple list search example: [https://www.roskilde.dk/da-dk/nyheder/](https://www.roskilde.dk/da-dk/nyheder/)
* Grouped list search example: [https://www.roskilde.dk/da-dk/sogning/](https://www.roskilde.dk/da-dk/sogning/)

## Installation

``` bash
yarn add @limbo-works/search
```

## Using the wrapper component

Install the component by extending the layer in `nuxt.config.js`.

``` js
export default defineNuxtConfig({
    extends: [
        '@limbo-works/search',
        ...
    ],
    ...
});
```

Then you can use the LimboSearch component anywhere within that solution:

``` html
<!-- As written in Vue -->
<LimboSearch
	:search-filters="{
		endpointUrl: '/api/search/',
		fields: [/* some fields expected syntax: {name:'freetext', value: ''}, {name:'siteId', value: ''}*/ ],
	}"
	#default="{ data, pagination }"
>
	<pre>{{ data }}</pre>
	<pre>{{ pagination }}</pre>
</LimboSearch>

<!-- As it may appear in the dom -->
<div class="c-limbo-search">
	<pre>[{ title: "test1" },...,{ title: "test12" }]</pre>
	<pre>{ limit: 12, offset: 0, total: 99 }</pre>
</div>
```

You can also use the useLimboSearch composable within a solution. This is a more flexible solution in many cases.

``` js
const limboSearch = await useLimboSearch({
	searchKey: route.path, /* or whatever key you want. This makes the search not interfere with other searches */
	searchFilters: {
		endpointUrl: '/api/search/',
		fields: [/* some fields expected syntax: {name:'freetext', value: ''}, {name:'siteId', value: ''}*/ ],
	},
	config: {
		immediateSearch: { useUrlQuery: true, ssr: true },
		...
	},
});
```

useLimboSearch gives access to

### Properties available through useLimboSearch

| Property | Description |
| -------- | ----------- |
| searchData | Contains results, pagination, facets, meta, misc and error data |
| state | Object with properties: `hasFetchedOnce`, `hasMoreItems`, `isAppend`, `isLoading`, `isInitiated`, `isUpdated` |
| query | Object containing the `parameters` property with current search parameters |
| requestSearch | Method that performs a search without resetting pagination |
| fetchMore | Method to fetch more results (with optional group ID and amount parameters) |
| fetchMoreAsync | Same as fetchMore but returns a Promise |
| fetchAll | Method to fetch all available results (with optional group ID parameter) |
| fetchAllAsync | Same as fetchAll but returns a Promise |
| submit | Method to submit a new search |
| submitWithLimit | Method to submit a search with a specific limit value |
| setUrlQuery | Method to update the URL query parameters |
| resetPagination | Method to reset pagination to its initial state |
| resetState | Method to reset state object to default values |
| getSerializedParams | Method to get serialized parameters as a query string |
| lastRequestedUrl | The URL of the last search request |
| latestResponse | The raw response from the last successful request |
| watchedParameters | Parameters being watched that trigger live search when changed |
| compConfig | The computed configuration object being used |


### Props overview

| Prop | Description | Default value | Data type |
| ---- | ----------- | ------------- | --------- |
| tag | The element tag to use for the wrapper. \`null\` will result in wrapper-less mode. | 'div' | String |
| searchFilters | Required, an object containing the `endpointUrl (String)` and the filtering input fields `fields (Array)`. | n/a | Object |
| extraParameters | Extra parameters to add to the search, which does not already exist in the filters. This could be a site or context id. These will be set with a low priority, meaning they may be overwritten by search filters sharing or url parameters sharing the same name. | {} | Object |
| parameterOverwrites | This is for when you want to overwrite a parameter value, whether it be an url set parameter, a search filter or some of the set extra parameters. | {} | Object |
| config | The config object will be explained in the overview below. In short, it is an object to configure how the search behaves in various ways. | See below | Object |
| searchKey | A unique key to identify this search instance. If not provided, the current route path will be used. This prevents different search instances from interfering with each other. | "" | String |

### Config overview

The configuration object (`config`-prop) allows you to finely tune the behaviour of the search component.

| Property | Description | Default value | Data type |
| -------- | ----------- | ------------- | --------- |
| callMethod | Can handle 'POST' and 'GET' | GET | String |
| enableLiveSearch | Can be either an array of particular parameters that should trigger a live search or simply a true or false value. | false | Boolean\|Array |
| immediateSearch | Tells whether the LimboSearch component should trigger a search immediately on creation. The value may be either a boolean value or an object (which will be read as a truthy value), whereas the object can have a true `useUrlQuery` property to have the component read parameter values from the url query. `ssr` decides if results should be server side rendered on load. | { useUrlQuery: true, ssr: true } | Boolean\|Object |
| clearRouterHashOnSearch | If set to true or given an object, a new search will trigger a removal of the hash from the route. Per default the initial search does not trigger this, but this can be changed by passing an object with `includeInitialSearch` set to true. | false | Boolean\|Object |
| limit | The number of search results to fetch per search. If a numeric limit is set, it will be used for both values - grouped paginations\* should be set with the corresponding ids (fx. `limit: { 1: { initial: 18, value: 12 }, 2: { initial: 15, value: 6 } }`). When an object is used, the `initial`-property dictates the limit of a new search, whereas the `value`-property dictates the limit of additive searches ("fetch more"). The `initial`-property is not required. | { initial: 12, value: 12 } | Number\|Object |
| enableGroupedSearch\* | Make use of grouped pagination (l1, o1, l2, o2, (ie. l{id}, o{id}) etc.) instead of simply "limit" and "offset". | false | Boolean |
| groupParameter | When needing to "fetch more / all" and grouped search is enabled\*, we need a parameter to filter that. The group parameter will then be assigned the id of the group currently being further searched. | 'groups' | String |
| updateUrlQueryOnSearch | This will update the url-query to reflect the search. | true | Boolean |
| updateVueRouteOnSearch | This will make the Vue router reflect the search. It may cause trouble if, for example, the page key uses the query, so beware. | false | Boolean |
| clearSearchDataOnError | If set to false, the search data from the previous search will persist if the new search was not successful. | true | Boolean |
| allowSearchFiltersMutation | If turned on, the LimboSearch component is allowed to mutate the passed in filters/fields in the search data to reflect the search. Else it will work from an internal copy. | false | Boolean |
| updateSearchFiltersOnBindingChange | Whether a change in the bound search filter property should trigger an update of the internally used data. | true | Boolean |
| persistentParameters | Parameters that should always be present in a search (empty or not). | ['contextId'] | Array |
| hiddenParameters | Parameters that should not be shown in the url but still be part of the search if present. | ['siteId', 'contextId', 'cultureId'] | Array |
| defaultParameterValues | If the current parameter value is the same as the default value set here, the parameter will be hidden from the url query. | {} | Object |
| searchResponseTransformerMethod | You can insert a method here to transform the response data from the endpoint in cases where the responses are formatted differently than expected\*\*. | res => res | Function |
| searchBodyTransformerMethod | You can insert a method here to transform the searchBody data, ONLY used when callMethod is POST, can be used to send extra data to endpoint. Currently only used when calling external endpoint. | data => data | Function |
| dataMergerMethod | If using grouped searching\* or if the search result isn't simply an array/as expected\*\*, you can insert a method here to handle the merging of data when doing a "fetch more/all" action. | (newData, oldData) => {/\* appends newData to oldData \*/} | Function |
| dataOutputTransformerMethod | Method to change the search data output without changing the internal data or values. | (data) => data | Function |
| searchDelay | A delay in milliseconds between changing filters and the actual search being executed. Required if using live-search. | 0 | Number |
| urlFilterMapping | Mapping for filters to url parameters (NOT FULLY IMPLEMENTED YET). | {} | Object |
| onInit | Hook function that is called when the search is initiated. The reactive Limbo search object is passed as the first argument. | () => {} | Function |
| onAfterSearch | Hook function that is called after each search request completes. The search data and state objects are passed as arguments. | undefined | Function |

#### \* Grouped searches

One important feature of this search component is the ability to do grouped searches, ie. multiple separate searches with individual paginations. This is handled by having an id assigned to each group, which will then be combined with paginations (l1, o1, l2, o2, etc.) and used to sort out the search data. When "fetching more", to tell the endpoint which group to fetch more of, the `groupParameter` is sent as part of the request.

#### \*\* Expected response from the endpoint

The response from the endpoint is expected to look somewhat like this:

```
{
    ...,
    data: [
        /* array of items */
    ],
    pagination: {
        limit: 12,
        offset: 0,
        total: 99,
    },
    ...,
}
```

Ie. `.data` is expected to be an array of items and `.pagination` is expected to contain the currently set `limit`, `offset` as well as the `total` \- the total amount of existing results for the search\. These values are required for the searching to work internally in the component\. Of course status code etc\. should be naturally part of the response as well\.

If the response data is different, the searchResponseTransformerMethod should be used to make sure `.data` and `.pagination` is there. If the data is formatted differently, but you for some reason or another want to keep it that way, you should use the `dataMergerMethod` to manually handle the merging when doing "fetch more/all".

The response may also contain the properties `.facets`, `.meta` and/or `.misc`, which will be relayed to the slot-props and event data as well. This allows extra data to be sent from the API, but are not used by the LimboSearch component itself in any capacity.

##### Grouped searches

When doing grouped searches, the response data is expected to look a little different, as we need to handle the groups:

```
{
    groups: [
        // Instead of .data and .pagination, an array of groups are expected
        ...,
        {
            id: 9, // Each group needs an id
            items: [
                ...,
                /* array of items in the group */
            ],
            limit: 12,
            offset: 0,
            total: 99,
        },
        ...,
    ],
}
```

Ie. the grouped search adds an extra layer to it all and moves the pagination to the root of each individual group, but other than that the logic stays the same.
Especially the pagination is important to get right, as this is handled entirely internally - the items/data you can always just handle with the dataMergerMethod.

### Events overview

| Event | Description |
| ----- | ----------- |
| @init | An event triggering only once whenever the component is initiated. If immediate search is enabled, this will be right before the first search request is made, else it will be emitted from the component's created event. The only event data attached to the event, is the value `true`. This event may be used to only insert the search filters on the page after the search is ready, to make sure the set values are in sync. |
| @update | Whenever a search update happens (a new or appended search is started or the results have come in), this event will trigger with an object of properties attached as the event data. These properties will be laid out below. |
| @error | If a request results in an error, this event will trigger with the error object attached as the event data. |

The update event is the most important event here, mirroring the same data you will have accessible through the slot props. Following are the properties you will receive through the event:

| Property | Description |
| -------- | ----------- |
| state | A state object giving information about the current state of the LimboSearch component through the properties `hasFetchedOnce`, `hasMoreItems`, `isAppend`, `isLoading`, `isInitiated` and `isUpdated`. All of these are boolean values, except if doing a grouped search, then `hasMoreItems` is an object with keys for each group id (which will then have a boolean value).<br><ul><li>`hasFetchedOnce`: Whether the LimboSearch component has executed at least one search.</li><li>`hasMoreItems`: Whether there is more items to be fetched.</li><li>`isAppend`: Whether the current search is an appending search ("Fetch more/all").</li><li>`isLoading`: Whether the current search is currently fetching.</li><li>`isInitiated`: Whether the search component has been initiated. This property will be false until either the `created`-event has run, or (if immediate search is turned on) until right before the first request is made.&nbsp;This property may be used to only insert the search filters or other elements on the page after the search is ready, to make sure the set values are in sync.</li><li>`isUpdated`: Whether a new search response is different from the latest response.</li></ul> |
| query | Object containing the `parameters`-property, which in turn contains the current search parameters in object form. |
| data | The `.data` fetched from the endpoint (after potentially being transformed by the `searchResponseTransformerMethod` or merged with previous data through the `dataMergerMethod`). Typically an array. |
| lastRequestedUrl | The URL of the last search request that was made. |
| latestResponse | The raw response object from the last successful request. |
| facets | The `.facets` fetched from the endpoint (if any, and after potential transformations). |
| meta | The `.meta` fetched from the endpoint (if any, and after potential transformations). |
| misc | The `.misc` fetched from the endpoint (if any, and after potential transformations). |
| action | An object of available functions to execute.<br><br><ul><li>`submit()`: A method to submit a new search as-is.</li><li>`submitWithLimit(limit)`: A method to submit a new search with a specific limit value.</li><li>`fetchMore([id],[amount])`: A method to fetch more results of the current search. If an amount isn't specified, the configured amount will be used. If doing grouped searches, the group id of the group to fetch more from should be supplied as the first argument.</li><li>`fetchMoreAsync([id],[amount])`: Same as fetchMore but returns a Promise.</li><li>`fetchAll([id])`: A method to fetch all the remaining results of the current search.&nbsp;If doing grouped searches, the group id of the group to fetch all from should be supplied.</li><li>`fetchAllAsync([id])`: Same as fetchAll but returns a Promise.</li><li>`resetPagination()`: Resets the pagination to its initial state.</li><li>`resetState()`: Resets the component state to default values.</li><li>`setUrlQuery([query], [clearHash])`: Updates the URL query parameters.</li><li>`getSerializedParams([parameters])`: Returns serialized parameters as a query string.</li></ul> |
| error | If the last request ended with an error, the error object will exist on this property. |

## Exposed slot props

The exposed slot props on the default slot will be the same data as sent out by the `update`-event. The component exposes the following properties:

- All properties listed in the Events overview table above
- `watchedParameters`: The parameters currently being watched for live search triggers (available through `composableInstance.watchedParameters`)
- `composableInstance`: The full useLimboSearch composable instance for advanced usage
- `options`: The computed options object passed to the composable

Note: `facets`, `meta`, `misc`, and `error` are available through the `searchData` object when using the composable directly, or as individual slot props when using the component.

## General notes

* Currently, when using `allowSearchFiltersMutation`, only single values are accepted. This means that array-parameters (ie. for checkbox lists) will not be correctly set or mutated. Only use when such filters/inputs aren't needed.
* `facets`, `meta` and `misc` exist in the component, as they were part of the legacy SkyList solution, and they may be a good place for extra data relevant to the search.

## Notes on possible improvement

* Make `allowSearchFiltersMutation` handle multi-value inputs and parameters as well.
* Insert a small cache of the most recent search, to allow for easy back-button'ing without doing a re-search.
* Allow for deep-linking alá "when the search is done, go to this result".
* Make a server-side search so that the results are already there when the page loads.
* Improve handling of extra data from the search.
* **Important:** Re-align with [forms](<a href="https://gist.github.com/abjerner/7a539fbaa0657a7a1acfc23c9e30384a">https://gist.github.com/abjerner/7a539fbaa0657a7a1acfc23c9e30384a</a>) setup in terms of filter mutation and query transformation.
* Possibly move these items to be issues.

<br>
<br>

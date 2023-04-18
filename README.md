# `LimboSearch`

Vue wrapper component for handling the searching actions on list/search pages. Handles both "simple lists" where the output of the search is an array with pagination, but also "grouped lists" where multiple paginations exist for multiple groups.

-   Simple list search example: [https://www.roskilde.dk/da-dk/nyheder/](https://www.roskilde.dk/da-dk/nyheder/)
-   Grouped list search example: [https://www.roskilde.dk/da-dk/sogning/](https://www.roskilde.dk/da-dk/sogning/)

## Installation

```bash
yarn add @limbo-works/limbo-nuxt-search
```

## Using the wrapper component

Import and install the LimboSearch wrapper component:

```js
import LimboSearch from 'path/to/LimboSearch';

export default {
	name: 'ExampleComponent',
	components: { LimboSearch },
	mounted() {
		console.log('Example component loaded');
	},
};
```

```html
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

### Props overview

| Prop                | Description                                                                                                                                                                                                                                                       | Default value | Data type |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------- |
| tag                 | The element tag to use for the wrapper.                                                                                                                                                                                                                           | 'div'         | String    |
| searchFilters       | Required, an object containing the `endpointUrl (String)` and the filtering input fields `fields (Array)`.                                                                                                                                                        | n/a           | Object    |
| extraParameters     | Extra parameters to add to the search, which does not already exist in the filters. This could be a site or context id. These will be set with a low priority, meaning they may be overwritten by search filters sharing or url parameters sharing the same name. | {}            | Object    |
| parameterOverwrites | This is for when you want to overwrite a parameter value, whether it be an url set parameter, a search filter or some of the set extra parameters.                                                                                                                | {}            | Object    |
| config              | The config object will be explained in the overview below. In short, it is an object to configure how the search behaves in various ways.                                                                                                                         | See below     | Object    |

### Config overview

The configuration object (`config`-prop) allows you to finely tune the behaviour of the search component.

| Property                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Default value                                              | Data type       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------- |
| enableLiveSearch                | Can be either an array of particular parameters that should trigger a live search or simply a true or false value.                                                                                                                                                                                                                                                                                                                                                              | false                                                      | Boolean\|Array  |
| immediateSearch                 | Tells whether the LimboSearch component should trigger a search immediatly on creation. The value may be either a boolean value or an object (which will be read as a truthy value), whereas the object can have a true `useUrlQuery` property to have the component ready parameter values from the url query.                                                                                                                                                                 | { useUrlQuery: true }                                      | Boolean\|Object |
| limit                           | The number of search results to fetch per search. If a numeric limit is set, it will be used for both values - grouped paginations\* should be set with the corresponding ids (fx. `limit: { l1: { initial: 18, value: 12 }, l2: { initial: 15, value: 6 } }`). When an object is used, the `initial`-property dictates the limit of a new search, whereas the `value`-property dictates the limit of additive searches ("fetch more"). The `initial`-property is not required. | { initial: 12, value: 12 }                                 | Number\|Object  |
| enableGroupedSearch\*           | Make use of grouped pagination (l1, o1, l2, o2, (ie. l{id}, o{id}) etc.) instead of simply "limit" and "offset".                                                                                                                                                                                                                                                                                                                                                                | false                                                      | Boolean         |
| groupParameter                  | When needing to "fetch more / all" and grouped search is enabled\*, we need a parameter to filter that. The group parameter will then be assigned the id of the group currently being further searched.                                                                                                                                                                                                                                                                         | 'groups'                                                   | String          |
| updateUrlQueryOnSearch          | This will update the url-query to reflect the search.                                                                                                                                                                                                                                                                                                                                                                                                                           | true                                                       | Boolean         |
| clearSearchDataOnError          | If set to false, the search data from the previous search will persist if the new search was not succesful.                                                                                                                                                                                                                                                                                                                                                                     | true                                                       | Boolean         |
| allowSearchFiltersMutation      | If turned on, the LimboSearch component is allowed to mutated the passed in filters/fields in the search data to reflect the search.                                                                                                                                                                                                                                                                                                                                            | false                                                      | Boolean         |
| persistentParameters            | Parameters that should always be present in a search (empty or not).                                                                                                                                                                                                                                                                                                                                                                                                            | ['contextId']                                              | Array           |
| hiddenParameters                | Parameters that should not be shown in the url.                                                                                                                                                                                                                                                                                                                                                                                                                                 | ['siteId', 'contextId', 'cultureId']                       | Array           |
| searchResponseTransformerMethod | You can insert a method here to transform the response data from the endpoint in cases where the responses are formatted differently than expected\*\*.                                                                                                                                                                                                                                                                                                                         | res => res                                                 | Function        |
| dataMergerMethod                | If using grouped searching\* or if the search result isn't simply an array/as expected\*\*, you can insert a method here to handle the merging of data when doing a "fetch more/all" action.                                                                                                                                                                                                                                                                                    | (newData, oldData) => {/\* appends newData to oldData \*/} | Function        |
| searchDelay                     | A delay in milliseconds between changing filters and the actual search being executed. Required if using live-search.                                                                                                                                                                                                                                                                                                                                                           | 0                                                          | Number          |

#### \* Grouped searches

One important feature of this search component is the ability to do grouped searches, ie. multiple separate searches with individual paginations. This is handled by having an id assigned to each group, which will then be combined with paginations (l1, o1, l2, o2, etc.) and used to sort out the search data. When "fetching more", to tell the endpoint which group to fetch more of, the `groupParameter` is sent as part of the request.

#### \*\* Expected response from the endpoint

The response from the endpoint is expected to look somewhat like this:

```
{
    ...,
    data: {
        ...,
        data: [
            /* array of items */
        ],
        pagination: {
            limit: 12,
            offset: 0,
            total: 99,
        },
    },
    ...,
}
```

Ie. `.data.data` is expected to be an array of items and `.data.pagination` is expected to contain the currently set `limit`, `offset` as well as the `total` \- the total amount of existing results for the search\. These values are required for the searching to work internally in the component\. Of course status code etc\. should be naturally part of the response as well\.

If the response data is different, the searchResponseTransformerMethod should be used to make sure `.data.data` and `.data.pagination` is there. If the data is formatted differently, but you for some reason or another want to keep it that way, you should use the `dataMergerMethod` to manually handle the merging when doing "fetch more/all".

`.data` may also contain the properties `facets`, `meta` and/or `misc`, which will be relayed to the slot-props and event data as well. This allows extra data to be sent from the API, but are not used by the LimboSearch component itself in any capacity.

##### Grouped searches

When doing grouped searches, the response data is expected to look a little different, as we need to handle the groups:

```
{
    ...,
    data: {
        ...,
        data: [
            ..., // Instead of items, an array of groups are expected
            {
                id: 9, // Each group needs an id
                items: [
                    /* array of items in the group */
                ],
                ...,
            },
        ],
        pagination: {
            ..., // Paginations should be keyed to the group ids
            '9': {
                limit: 12,
                offset: 0,
                total: 99,
            },
        },
    },
    ...,
}
```

Ie. the grouped search adds an extra layer to it all, but other than that the logic stays the same.
Especially the pagination is important to get right, as this is handled entirely internally - the items/data you can always just handle with the dataMergerMethod.

### Events overview

| Event   | Description                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| @init   | An event triggering only once whenever the component is initiated. If immediate search is enabled, this will be right before the first search request is made, else it will be emitted from the component's created event. The only event data attached to the event, is the value `true`. This event may be used to only insert the search filters on the page after the search is ready, to make sure the set values are in sync. |
| @update | Whenever a search update happens (a new or appended search is started or the results have come in), this event will trigger with an object of properties attached as the event data. These properties will be layn out below.                                                                                                                                                                                                       |
| @error  | If a request results in an error, this event will trigger with the error object attached as the event data.                                                                                                                                                                                                                                                                                                                         |

The update event is the most important event here, mirroring the same data you will have accessible through the slot props. Following are the properties you will receive through the event:

| Property | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| state    | A state object giving information about the current state of the LimboSearch component through the properties `hasFetchedOnce`, `hasMoreItems`, `isAppend`, `isLoading` and `isInitiated`. All of these are boolean values, except if doing a grouped search, then `hasMoreItems` is an object with keys for each group id (which will then have a boolean value).<br><ul><li>`hasFetchedOnce`: Whether the LimboSearch component has executed at least one search.</li><li>`hasMoreItems`: Whether there is more items to be fetched.</li><li>`isAppend`: Whether the current search is an appending search ("Fetch more/all").</li><li>`isLoading`: Whether the current search is currently fetching.</li><li>`isInitiated`: Wheter the search component has been initiated. This property will be false until either the `created`-event has run, or (if immediate search is turned on) until right before the first request is made.&nbsp;This property may be used to only insert the search filters or other elements on the page after the search is ready, to make sure the set values are in sync.</li></ul> |
| query    | Object containing the `parameters`-property, which in turn contains the current search parameters in object form.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| data     | The `.data.data` fetched from the endpoint (after potentially being transformed by the `searchResponseTransformerMethod` or merged with previous data through the `dataMergerMethod`). Typically an array.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| facets   | The `.data.facets` fetched from the endpoint (if any, and after potential transformations).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| meta     | The `.data.meta` fetched from the endpoint (if any, and after potential transformations).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| misc     | The `.data.misc` fetched from the endpoint (if any, and after potential transformations).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| action   | An object of available functions to execute.<br><br><ul><li>`submit()`: A method to submit a new search as-is.</li><li>`fetchMore([id],[amount])`: A method to fetch more results of the current search. If an amount isn't specified, the configured amount will be used. If doing grouped searches, the group id of the group to fetch more from should be supplied as the first argument.</li><li>`fetchAll([id])`: A method to fetch all the remaining results of the current search.&nbsp;If doing grouped searches, the group id of the group to fetch all from should be supplied.</li></ul>                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| error    | If the last request ended with an error, the error object will exist on this property.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## Exposed slot props

The exposed slot props on the default slot will be the same data as sent out by the `update`-event. Refer to the same table above.

## General notes

-   Currently, when using `allowSearchFiltersMutation`, only single values are accepted. This means that array-parameters (ie. for checkbox lists) will not be correctly set or mutated. Only use when such filters/inputs aren't needed.
-   `facets`, `meta` and `misc` exist in the component, as they were part of the legacy SkyList solution, and they may be a good place for extra data relevant to the search.

## Notes on possible improvement

-   Make `allowSearchFiltersMutation` handle multi-value inputs and parameters as well.
-   Insert a small cache of the most recent search, to allow for easy back-button'ing without doing a re-search.
-   Allow for deep-linking alá "when the search is done, go to this result".
-   **Important:** Re-allign with [forms](<a href="https://gist.github.com/abjerner/7a539fbaa0657a7a1acfc23c9e30384a">https://gist.github.com/abjerner/7a539fbaa0657a7a1acfc23c9e30384a</a>) setup in terms of filter mutation and query transformation.

<br>
<br>

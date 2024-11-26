<template>
	<div>
		<div class="links">
			<NuxtLink to="/page1">Page 1</NuxtLink>
			<NuxtLink to="/page2">Page 2</NuxtLink>
			<NuxtLink to="/page3">Page 3</NuxtLink>
		</div>
		<NuxtPage />
	</div>
</template>

<script setup></script>
<style>
.links {
	display: flex;
	justify-content: space-around;
}
</style>

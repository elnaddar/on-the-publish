<script lang="ts">
	import { page } from '$app/stores';
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-gray-100 text-center">
	<h1 class="mb-4 text-6xl font-bold text-gray-800">{$page.status}</h1>
	<p class="mb-8 text-2xl text-gray-600">{$page.error?.message || 'Oops! Something went wrong.'}</p>
	{#if $page.status === 404}
		<p class="mb-8 text-xl text-gray-600">Sorry, the page you are looking for does not exist.</p>
	{/if}
	<a href="/" class="rounded bg-blue-600 px-6 py-3 text-lg font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50">
		Go to Homepage
	</a>
</div>

<style>
	/* Basic Tailwind utility classes are used directly in the markup */
</style> 
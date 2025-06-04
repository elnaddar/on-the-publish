<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import pako from 'pako';
	import { browser } from '$app/environment'; // Import browser for navigator.onLine check

	export let markdownInput: string;
	export let initialRtl: boolean;
	export let initialTheme: string;
	export let availableThemes: string[];

	const dispatch = createEventDispatcher();

	let isEditable = false;
	let isShareRtl: boolean = initialRtl;
	let shareTheme: string = initialTheme;
	let generatedLink = '';
	let shouldShortenUrl = false; // New state for the checkbox
	let shortenUrlError = ''; // To display errors like "No internet"
	let isShortening = false; // For loading indicator
	let currentLongLink = ''; // Store the current long link to avoid re-shortening unnecessarily

	async function generateAndMaybeShortenLink() {
		shortenUrlError = '';
		isShortening = false;

		// First, generate the long link (data part)
		const dataToShare = {
			markdown: markdownInput,
			options: {
				editable: isEditable,
				rtl: isShareRtl,
				theme: shareTheme,
				readOnly: !isEditable
			}
		};

		let newLongLink = '';
		try {
			const jsonString = JSON.stringify(dataToShare);
			const compressedUint8Array = pako.deflate(jsonString);
			let binaryString = '';
			for (let i = 0; i < compressedUint8Array.length; i++) {
				binaryString += String.fromCharCode(compressedUint8Array[i]);
			}
			const encoded = btoa(binaryString);
			const baseUrl = window.location.origin + window.location.pathname;
			newLongLink = `${baseUrl}#share=${encoded}`;
		} catch (e) {
			console.error('Error generating base share link data:', e);
			generatedLink = 'Error generating link.';
			shortenUrlError = 'Could not generate the base share link.';
			currentLongLink = '';
			return;
		}

		currentLongLink = newLongLink; // Store the new long link

		if (shouldShortenUrl) {
			if (browser && !navigator.onLine) {
				shortenUrlError = 'No internet connection. Cannot shorten URL.';
				generatedLink = currentLongLink; // Fallback to long link
				return;
			}
			isShortening = true;
			try {
				const formData = new URLSearchParams();
				formData.append('url', currentLongLink);

				const response = await fetch('https://spoo.me/', { // Using Spoo.me API
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'Accept': 'application/json'
					},
					body: formData
				});

				if (!response.ok) {
					// Try to parse error from Spoo.me if possible, otherwise generic message
					let errorMsg = `HTTP error ${response.status}`;
					try {
						const errorData = await response.json();
						if (errorData && errorData.message) {
							errorMsg = errorData.message;
						} else if (response.status === 429) {
							errorMsg = 'Rate limit exceeded for URL shortener. Please try again later.';
						}
					} catch (parseError) {
						// Ignore if error response is not JSON
					}
					throw new Error(errorMsg);
				}

				const data = await response.json();
				if (data.short_url) {
					generatedLink = data.short_url;
				} else {
					generatedLink = currentLongLink; // Fallback if API response is not as expected
					shortenUrlError = 'Failed to retrieve shortened URL from API (invalid response).';
				}
			} catch (e: any) {
				console.error('Error shortening URL with Spoo.me:', e);
				shortenUrlError = e.message || 'Error shortening URL.';
				generatedLink = currentLongLink; // Fallback to long link on error
			} finally {
				isShortening = false;
			}
		} else {
			generatedLink = currentLongLink;
		}
	}

	function copyLink() {
		if (browser && navigator.clipboard && generatedLink && !generatedLink.startsWith('Error')) {
			navigator.clipboard
				.writeText(generatedLink)
				.then(() => {
					alert('Link copied to clipboard!');
				})
				.catch((err) => {
					console.error('Failed to copy link: ', err);
					alert('Failed to copy link.');
				});
		}
	}

	onMount(() => {
		if (browser) {
			generateAndMaybeShortenLink(); // Generate link initially
		}
	});

	// Regenerate link when options change
	// Debounce or make smarter to avoid excessive API calls if user rapidly clicks "shouldShortenUrl"
	$: if (browser && (markdownInput || isEditable || isShareRtl || shareTheme || shouldShortenUrl)) {
		generateAndMaybeShortenLink();
	}
</script>

<div
	class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black backdrop-blur-sm"
	aria-labelledby="shareModalTitle"
	role="dialog"
	aria-modal="true"
>
	<div
		class="w-full max-w-lg rounded-lg bg-white p-6 text-gray-800 shadow-xl"
		dir={isShareRtl ? 'rtl' : 'ltr'}
	>
		<h2 id="shareModalTitle" class="mb-4 text-2xl font-semibold">Share Markdown</h2>

		<div class="mb-6 space-y-4">
			<div>
				<label class="flex items-center space-x-2">
					<input
						type="checkbox"
						bind:checked={isEditable}
						class="form-checkbox h-5 w-5 text-blue-600"
					/>
					<span>Allow Editing (Link will open in editor mode)</span>
				</label>
				<p class="ml-7 text-sm text-gray-600">
					If unchecked, the link will be read-only and open in publish mode.
				</p>
			</div>

			<div>
				<label class="flex items-center space-x-2">
					<input
						type="checkbox"
						bind:checked={isShareRtl}
						class="form-checkbox h-5 w-5 text-blue-600"
					/>
					<span>Right-to-Left (RTL) Text Direction for Shared Content</span>
				</label>
			</div>

			<div>
				<label for="shareThemeSelect" class="mb-1 block text-sm font-medium text-gray-700"
					>Code Block Theme for Shared Content</label
				>
				<select
					id="shareThemeSelect"
					bind:value={shareTheme}
					class="mt-1 block w-full rounded-md border-gray-300 bg-white py-2 pr-10 pl-3 text-base focus:border-blue-500 focus:ring-blue-500 focus:outline-none sm:text-sm"
				>
					{#each availableThemes as theme}
						<option value={theme}
							>{theme
								.split('-')
								.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
								.join(' ')}</option
						>
					{/each}
				</select>
			</div>

			<div>
				<label class="flex items-center space-x-2">
					<input
						type="checkbox"
						bind:checked={shouldShortenUrl}
						class="form-checkbox h-5 w-5 text-blue-600"
						disabled={isShortening}
					/>
					<span>Shorten Shareable URL</span>
				</label>
				{#if shortenUrlError}
					<p class="ml-7 mt-1 text-sm text-red-600">{shortenUrlError}</p>
				{/if}
				{#if isShortening}
					<p class="ml-7 mt-1 text-sm text-blue-600">Shortening URL...</p>
				{/if}
			</div>
		</div>

		<div class="mb-4">
			<label for="generatedLinkTextarea" class="mb-1 block text-sm font-medium text-gray-700"
				>Shareable Link:</label
			>
			<textarea
				id="generatedLinkTextarea"
				readonly
				bind:value={generatedLink}
				class="h-24 w-full resize-none rounded-md border border-gray-300 bg-gray-50 p-2 font-mono text-xs {shortenUrlError ? 'border-red-500' : ''}"
				aria-label="Generated Shareable Link"
				placeholder={isShortening ? 'Generating link...' : 'Link will appear here...'}
			></textarea>
		</div>

		<div class="flex items-center justify-end space-x-3">
			{#if shortenUrlError && shortenUrlError.includes('Rate limit')}
				<p class="mr-auto text-xs text-yellow-700">Try again in a minute.</p>
			{/if}
			<button
				on:click={() => dispatch('close')}
				class="rounded bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300"
			>
				Close
			</button>
			<button
				on:click={copyLink}
				class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
				disabled={!generatedLink || generatedLink.startsWith('Error') || isShortening}
			>
				{#if isShortening}
					<svg class="mr-2 inline h-4 w-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					  </svg>
					  Copying...
				{:else}
					Copy Link
				{/if}
			</button>
		</div>
	</div>
</div>
 
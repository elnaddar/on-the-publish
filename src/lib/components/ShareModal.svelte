<script lang="ts">
	import { onMount, createEventDispatcher, tick } from 'svelte';
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

	// Core link generation
	let baseGeneratedLink = ''; // The full, un-shortened URL
	let displayLink = ''; // The URL displayed to the user and copied

	// Shortening state
	let shortenUrlActive = false; // True if user wants to shorten the current baseGeneratedLink
	let shortenedSuccessUrl = ''; // Stores the successfully shortened URL
	let isShortening = false; // True while API call is in progress
	let shortenError = ''; // Error message for shortening

	const SPOO_ME_API_LIMIT = 'Spoo.me API: 5 req/min, 60 req/hr';

	// Function to generate the base (long) shareable link
	function regenerateBaseLink() {
		if (!browser) return;
		const dataToShare = {
			markdown: markdownInput,
			options: {
				editable: isEditable,
				rtl: isShareRtl,
				theme: shareTheme,
				readOnly: !isEditable
			}
		};
		try {
			const jsonString = JSON.stringify(dataToShare);
			const compressedUint8Array = pako.deflate(jsonString);
			let binaryString = '';
			for (let i = 0; i < compressedUint8Array.length; i++) {
				binaryString += String.fromCharCode(compressedUint8Array[i]);
			}
			const encoded = btoa(binaryString);
			const baseUrl = window.location.origin + window.location.pathname;
			baseGeneratedLink = `${baseUrl}#share=${encoded}`;
		} catch (e) {
			console.error('Error generating base share link data:', e);
			baseGeneratedLink = 'Error generating link data.';
			shortenError = 'Could not generate the base share link data.'; // Show error
		}
	}

	// Reactive: Regenerate base link if core options change
	$: if (browser) regenerateBaseLink();

	// Reactive: If base link changes while shorten was active, deactivate shorten
	$: if (baseGeneratedLink && browser) {
		if (shortenUrlActive) {
			shortenUrlActive = false; // User needs to re-enable for the new link
			shortenedSuccessUrl = '';
			shortenError = 'Options changed. Re-enable shorten for new link.';
		}
	}

	// Reactive: Determine the link to display
	$: displayLink = shortenUrlActive && shortenedSuccessUrl ? shortenedSuccessUrl : baseGeneratedLink;


	async function attemptShortenUrl() {
		if (!shortenUrlActive || !baseGeneratedLink || baseGeneratedLink.startsWith('Error')) {
			shortenedSuccessUrl = '';
			shortenError = shortenUrlActive ? 'Base link is invalid or not generated.' : '';
			return;
		}

		if (browser && !navigator.onLine) {
			shortenError = 'No internet connection. Cannot shorten URL.';
			shortenUrlActive = false; // Turn off switch
			return;
		}

		isShortening = true;
		shortenError = '';
		shortenedSuccessUrl = '';

		try {
			const formData = new URLSearchParams();
			formData.append('url', baseGeneratedLink);

			const response = await fetch('https://spoo.me/', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Accept': 'application/json'
				},
				body: formData
			});

			if (!response.ok) {
				let errorMsg = `Shorten API error: ${response.status}`;
				try {
					const errorData = await response.json();
					if (errorData && errorData.message) {
						errorMsg = errorData.message;
					} else if (response.status === 429) {
						errorMsg = 'Rate limit exceeded for URL shortener. Please try again later.';
					}
				} catch (parseError) { /* ignore */ }
				throw new Error(errorMsg);
			}

			const data = await response.json();
			if (data.short_url) {
				shortenedSuccessUrl = data.short_url;
			} else {
				throw new Error('Failed to retrieve shortened URL from API (invalid response).');
			}
		} catch (e: any) {
			console.error('Error shortening URL with Spoo.me:', e);
			shortenError = e.message || 'Error shortening URL.';
			shortenUrlActive = false; // Turn off switch on error
			shortenedSuccessUrl = '';
		} finally {
			isShortening = false;
		}
	}

	// When the shortenUrlActive toggle changes to true, attempt to shorten
	$: if (shortenUrlActive && browser && !isShortening && !shortenedSuccessUrl && baseGeneratedLink && !baseGeneratedLink.startsWith('Error')) {
		attemptShortenUrl();
	}


	function copyLink() {
		if (browser && navigator.clipboard && displayLink && !displayLink.startsWith('Error')) {
			navigator.clipboard
				.writeText(displayLink)
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
			regenerateBaseLink(); // Generate base link initially
		}
	});

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
		</div>

		<div class="mb-4">
			<label for="generatedLinkTextarea" class="mb-1 block text-sm font-medium text-gray-700"
				>Shareable Link:</label
			>
			<textarea
				id="generatedLinkTextarea"
				readonly
				bind:value={displayLink}
				class="h-24 w-full resize-none rounded-md border border-gray-300 bg-gray-50 p-2 font-mono text-xs {shortenError && !shortenUrlActive ? 'border-red-500' : ''}"
				aria-label="Generated Shareable Link"
				placeholder={isShortening ? 'Generating link...' : (baseGeneratedLink || 'Link will appear here...') }
			></textarea>
		</div>
		
		<div class="mb-4 space-y-2">
			<label class="flex cursor-pointer items-center">
				<div class="relative">
				  <input type="checkbox" class="sr-only" bind:checked={shortenUrlActive} disabled={isShortening || !baseGeneratedLink || baseGeneratedLink.startsWith('Error')}/>
				  <div class="block h-6 w-10 rounded-full bg-gray-300 transition"></div>
				  <div class="dot absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition"></div>
				</div>
				<div class="ml-3 text-sm text-gray-700">
					Shorten URL 
					<span class="text-xs text-gray-500">({SPOO_ME_API_LIMIT})</span>
				</div>
			</label>
			{#if isShortening}
				<p class="text-sm text-blue-600">Shortening URL...</p>
			{/if}
			{#if shortenError}
				<p class="text-sm text-red-600">{shortenError}</p>
			{/if}
		</div>

		<div class="flex items-center justify-end space-x-3 border-t pt-4 mt-4">
			<button
				on:click={() => dispatch('close')}
				class="rounded bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300"
			>
				Close
			</button>
			<button
				on:click={copyLink}
				class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
				disabled={!displayLink || displayLink.startsWith('Error') || isShortening || (shortenUrlActive && !shortenedSuccessUrl)}
			>
				{#if isShortening && shortenUrlActive}
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

<style>
	/* Basic toggle switch styling */
	input[type="checkbox"].sr-only:checked + div {
		background-color: #4f46e5; /* Tailwind indigo-600 */
	}
	input[type="checkbox"].sr-only:checked + div + div.dot {
		transform: translateX(100%);
		background-color: white;
	}
	div.dot {
		/* Adjust based on block size if needed */
		width: 1rem; /* h-4 */
		height: 1rem; /* w-4 */
		top: 0.125rem; /* top-0.5 approx */
		left: 0.125rem; /* left-0.5 approx */
	}
	div.block {
		width: 2.5rem; /* w-10 */
		height: 1.5rem; /* h-6 */
	}

	/* Disabled state for toggle */
	input[type="checkbox"].sr-only:disabled + div {
		background-color: #d1d5db; /* Tailwind gray-300 */
		cursor: not-allowed;
	}
	input[type="checkbox"].sr-only:disabled + div + div.dot {
		background-color: #9ca3af; /* Tailwind gray-400 */
	}
	label.flex.cursor-pointer.items-center input[type="checkbox"].sr-only:disabled ~ .ml-3 {
		color: #9ca3af; /* Tailwind gray-400 */
		cursor: not-allowed;
	}

</style>
 
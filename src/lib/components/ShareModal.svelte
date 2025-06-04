<script lang="ts">
	import { onMount, createEventDispatcher, afterUpdate } from 'svelte';
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

	let baseGeneratedLink = ''; // Always holds the full, unshortened link
	let displayLink = ''; // The link shown in the input field (can be long or short)
	let shortenedUrlFromApi = ''; // Stores the successfully shortened URL from Spoo.me
	
	let shortenToggleActive = false; // State for the new "Shorten URL" toggle
	let isShortening = false; // For loading indicator
	let shortenUrlError = ''; // To display errors

	// Function to generate the full shareable link (long version)
	function generateFullShareLink() {
		shortenUrlError = ''; // Clear previous errors when options change
		try {
			const dataToShare = {
				markdown: markdownInput,
				options: {
					editable: isEditable,
					rtl: isShareRtl,
					theme: shareTheme,
					readOnly: !isEditable
				}
			};
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
			shortenUrlError = 'Could not generate the base share link data.';
		}
	}

	async function handleShortenToggle() {
		if (shortenToggleActive) { // User wants to shorten
			if (browser && !navigator.onLine) {
				shortenUrlError = 'No internet connection. Cannot shorten URL.';
				shortenToggleActive = false; // Revert toggle
				displayLink = baseGeneratedLink; // Ensure long link is shown
				return;
			}
			
			isShortening = true;
			shortenUrlError = '';
			try {
				const formData = new URLSearchParams();
				formData.append('url', baseGeneratedLink); // Shorten the current base link

				const response = await fetch('https://spoo.me/', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
						'Accept': 'application/json'
					},
					body: formData
				});

				if (!response.ok) {
					let errorMsg = `HTTP error ${response.status}`;
					try {
						const errorData = await response.json();
						if (errorData && errorData.message) {
							errorMsg = errorData.message;
						} else if (response.status === 429) {
							errorMsg = 'Rate limit exceeded (5/min). Please try again later.';
						}
					} catch (parseError) { /* Ignore */ }
					throw new Error(errorMsg);
				}

				const data = await response.json();
				if (data.short_url) {
					shortenedUrlFromApi = data.short_url;
					displayLink = shortenedUrlFromApi;
				} else {
					throw new Error('Failed to retrieve shortened URL from API (invalid response).');
				}
			} catch (e: any) {
				console.error('Error shortening URL with Spoo.me:', e);
				shortenUrlError = e.message || 'Error shortening URL.';
				shortenedUrlFromApi = '';
				displayLink = baseGeneratedLink; // Fallback to long link
				shortenToggleActive = false; // Revert toggle on error
			} finally {
				isShortening = false;
			}
		} else { // User wants to revert to long link or toggle was turned off
			displayLink = baseGeneratedLink;
			shortenedUrlFromApi = ''; // Clear any previously shortened link
			// shortenUrlError = ''; // Don't clear error if it was due to a failed shorten attempt that auto-toggled off
		}
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
	
	// Initial generation and when fundamental inputs change
	onMount(() => {
		if (browser) {
			generateFullShareLink();
			displayLink = baseGeneratedLink; // Initialize displayLink
		}
	});

	// $: console.log({ markdownInput, isEditable, isShareRtl, shareTheme});

	// Reactive statement for option changes
	$: if (browser && (markdownInput, isEditable, isShareRtl, shareTheme)) {
		// This block runs when any of these dependencies change.
		// It needs to be careful not to run unnecessarily on initial mount if onMount already handles it.
		// Svelte's reactivity might trigger this multiple times initially if props are passed.
		// Using afterUpdate can sometimes help, or ensuring onMount handles the very first setup.
		
		// Generate the full link whenever options change
		generateFullShareLink();
		
		// If the toggle was active, and options changed, reset it and show the new long link.
		if (shortenToggleActive) {
			shortenToggleActive = false; // Turn off the toggle
			// The handleShortenToggle will be called due to bind:checked,
			// or we can directly set displayLink here.
			// Setting shortenToggleActive to false will trigger its bound logic IF using bind:checked.
			// If not, we must manually update displayLink.
		}
		// Always ensure displayLink reflects the latest baseGeneratedLink after options change,
		// unless a successful shorten operation is active (which is handled by shortenToggleActive being false now)
		if (!shortenToggleActive) {
			displayLink = baseGeneratedLink;
		}
		shortenedUrlFromApi = ''; // Clear any old shortened URL
		// Do not clear shortenUrlError here as it might be relevant from a previous failed attempt.
		// generateFullShareLink() already clears it if a new link is successfully made.
	}

	// This reactive statement handles the consequence of `shortenToggleActive` changing,
	// typically due to user interaction with the toggle switch.
	$: if (browser && shortenToggleActive !== undefined) { // Check !== undefined to avoid running on init before bind:checked
		// We need to ensure this doesn't fight with the option change logic.
		// The primary action of shortening or reverting to long URL is now in handleShortenToggle,
		// which is called when the user clicks the switch.
		// If options change, the above block sets shortenToggleActive = false,
		// then this block might run.
		// If shortenToggleActive is false here, we ensure displayLink is baseGeneratedLink.
		if (!shortenToggleActive) {
			displayLink = baseGeneratedLink;
			shortenedUrlFromApi = ''; // Clear any previously shortened link
		}
		// If shortenToggleActive is true, the user *just* clicked it.
		// handleShortenToggle will be invoked by the click event on the switch.
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
		</div>

		<div class="mb-4">
			<label for="generatedLinkTextarea" class="mb-1 block text-sm font-medium text-gray-700"
				>Shareable Link:</label
			>
			<textarea
				id="generatedLinkTextarea"
				readonly
				bind:value={displayLink}
				class="h-24 w-full resize-none rounded-md border border-gray-300 bg-gray-50 p-2 font-mono text-xs {shortenUrlError ? 'border-red-500' : ''}"
				aria-label="Generated Shareable Link"
				placeholder={isShortening ? 'Generating link...' : (baseGeneratedLink || 'Link will appear here...')}
			></textarea>
			{#if shortenUrlError}
				<p class="mt-1 text-sm text-red-600">{shortenUrlError}</p>
			{/if}
		</div>
		
		<div class="mb-4 flex items-center justify-between">
			<div class="flex items-center space-x-2">
				<label
					for="shortenUrlToggle"
					class="flex cursor-pointer items-center text-sm font-medium text-gray-700"
				>
					<span class="mr-2">Shorten URL</span>
					<input
						type="checkbox"
						id="shortenUrlToggle"
						bind:checked={shortenToggleActive}
						on:change={handleShortenToggle} 
						disabled={isShortening || !baseGeneratedLink || baseGeneratedLink.startsWith('Error')}
						class="form-switch sr-only"
					/>
					<div class="relative">
						<div class="block h-6 w-10 rounded-full bg-gray-300 transition"></div>
						<div
							class="dot absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition {shortenToggleActive ? 'translate-x-full !bg-blue-600' : ''}"
						></div>
					</div>
				</label>
				{#if isShortening}
					<p class="text-sm text-blue-600">Working...</p>
				{/if}
			</div>
			<p class="text-xs text-gray-500">API Limit: 5/min (Spoo.me)</p>
		</div>


		<div class="flex items-center justify-end space-x-3 border-t pt-4">
			<button
				on:click={() => dispatch('close')}
				class="rounded bg-gray-200 px-4 py-2 text-sm text-gray-800 hover:bg-gray-300"
			>
				Close
			</button>
			<button
				on:click={copyLink}
				class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
				disabled={!displayLink || displayLink.startsWith('Error') || isShortening}
			>
				{#if isShortening && shortenToggleActive} 
					<!-- Show spinner only if shortening is active for THIS toggle press -->
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
	.form-switch:checked + .relative .block {
		background-color: #2563eb; /* blue-600 */
	}
	.form-switch:checked + .relative .dot {
		transform: translateX(100%);
		background-color: white;
	}
</style>
 
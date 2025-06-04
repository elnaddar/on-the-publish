<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	import pako from 'pako';

	export let markdownInput: string;
	export let initialRtl: boolean;
	export let initialTheme: string;
	export let availableThemes: string[];

	const dispatch = createEventDispatcher();

	let isEditable = false;
	let isShareRtl: boolean = initialRtl;
	let shareTheme: string = initialTheme;
	
	let generatedLink = ''; // The full, unshortened link
	let actualLinkToDisplay = ''; // What's shown in the textarea and copied
	let isShortening = false;
	let toastMessage = '';
	let toastTimeout: number | undefined = undefined;

	function showToast(message: string, duration: number = 3000) {
		toastMessage = message;
		clearTimeout(toastTimeout);
		toastTimeout = window.setTimeout(() => {
			toastMessage = '';
		}, duration);
	}

	function checkInternetConnection(): boolean {
		return navigator.onLine;
	}

	// Generates the long, encoded link based on current options
	function generateBaseLink() {
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
			generatedLink = `${baseUrl}#share=${encoded}`;
		} catch (e) {
			console.error('Error generating share link:', e);
			generatedLink = 'Error generating link.';
		}
		actualLinkToDisplay = generatedLink; // Always update display with the new base link
	}

	async function handleShortenUrlClick() {
		if (generatedLink.startsWith('Error')) {
			showToast('Cannot shorten: Base link has an error.', 3000);
			return;
		}
		if (actualLinkToDisplay.includes('spoo.me/')) {
			showToast('Link is already shortened.', 3000);
			return;
		}
		if (!checkInternetConnection()) {
			showToast('No internet connection. Cannot shorten URL.', 3000);
			return;
		}

		isShortening = true;
		try {
			const response = await fetch("https://spoo.me/", {
				method: "POST",
				headers: {
					"Accept": "application/json",
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({ url: generatedLink }), // Shorten the master generatedLink
			});

			if (response.ok) {
				const data = await response.json();
				actualLinkToDisplay = data.short_url;
				showToast("URL shortened successfully!");
			} else if (response.status === 429) {
				showToast("Spoo.me API rate limit reached. Please try again later.", 5000);
				// actualLinkToDisplay remains generatedLink (the long one)
			} else {
				const errorText = await response.text();
				showToast(`Failed to shorten URL (Error ${response.status}).`, 5000);
				console.error("Spoo.me API error:", errorText);
				// actualLinkToDisplay remains generatedLink
			}
		} catch (error) {
			showToast("Error connecting to URL shortener.", 5000);
			console.error("Network or other error:", error);
			// actualLinkToDisplay remains generatedLink
		} finally {
			isShortening = false;
		}
	}

	function copyLink() {
		if (navigator.clipboard && actualLinkToDisplay && !actualLinkToDisplay.startsWith('Error')) {
			navigator.clipboard
				.writeText(actualLinkToDisplay)
				.then(() => showToast('Link copied to clipboard!'))
				.catch((err) => {
					console.error('Failed to copy link: ', err);
					showToast('Failed to copy link.', 3000);
				});
		}
	}

	onMount(() => {
		generateBaseLink(); // Generate and display the initial long link
	});

	// Regenerate base link and reset display when options change
	$: if (markdownInput || isEditable || isShareRtl || shareTheme) {
		generateBaseLink();
	}

</script>

<div
	class="bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black backdrop-blur-sm"
>
	<div
		class="w-full max-w-lg rounded-lg bg-white p-6 text-gray-800 shadow-xl"
		dir={isShareRtl ? 'rtl' : 'ltr'}
	>
		<h2 class="mb-4 text-2xl font-semibold">Share Markdown</h2>

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
					<span>Right-to-Left (RTL) Text Direction</span>
				</label>
			</div>

			<div>
				<label for="shareThemeSelect" class="mb-1 block text-sm font-medium text-gray-700"
					>Code Block Theme</label
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

		<div class="mb-2">
			<label for="generatedLinkTextarea" class="mb-1 block text-sm font-medium text-gray-700"
				>Shareable Link:</label
			>
			<textarea
				id="generatedLinkTextarea"
				readonly
				bind:value={actualLinkToDisplay}
				class="h-24 w-full resize-none rounded-md border border-gray-300 bg-gray-50 p-2 font-mono text-xs"
				aria-label="Generated Shareable Link"
			></textarea>
		</div>

		<!-- API Limits Info -->
		{#if actualLinkToDisplay.includes('spoo.me/')}
			<p class="mb-3 text-xs text-gray-500">
				Shortened with spoo.me (Limits: 5/min, 50/hour, 500/day).
			</p>
		{/if}

		<!-- Toast Message Area -->
		{#if toastMessage}
			<div class="mb-4 rounded-md bg-slate-700 p-3 text-center text-sm text-white shadow-lg transition-all duration-300 ease-in-out">
				{toastMessage}
			</div>
		{/if}

		<div class="flex items-center justify-end space-x-3">
			<button
				on:click={handleShortenUrlClick}
				class="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
				disabled={isShortening || generatedLink.startsWith('Error') || actualLinkToDisplay.includes('spoo.me/')}
			>
				{#if isShortening}
					<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
					  </svg>
					Shortening...
				{:else}
					Shorten URL
				{/if}
			</button>
			<button
				on:click={copyLink}
				class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
				disabled={!actualLinkToDisplay || actualLinkToDisplay.startsWith('Error') || isShortening}
			>
				Copy Link
			</button>
			<button
				on:click={() => dispatch('close')}
				class="rounded bg-gray-200 px-4 py-2 text-sm text-gray-800 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
			>
				Close
			</button>
		</div>
	</div>
</div>

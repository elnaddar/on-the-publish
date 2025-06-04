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
	let generatedLink = '';
	let isShortenUrlEnabled = false;
	let isShortening = false;
	let actualLinkToDisplay = ''; // Will hold either generatedLink or shortenedLink
	let toastMessage = '';
	let toastTimeout: number | undefined = undefined;
	let showApiLimitsInfo = false;

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

	function generateLink() {
		const dataToShare = {
			markdown: markdownInput,
			options: {
				editable: isEditable,
				rtl: isShareRtl,
				theme: shareTheme,
				readOnly: !isEditable // Explicitly set readOnly based on isEditable
			}
		};

		try {
			const jsonString = JSON.stringify(dataToShare);
			const compressedUint8Array = pako.deflate(jsonString); // Returns Uint8Array
			let binaryString = '';
			for (let i = 0; i < compressedUint8Array.length; i++) {
				binaryString += String.fromCharCode(compressedUint8Array[i]);
			}
			const encoded = btoa(binaryString);

			// Construct the URL. We will need a separate route/page to handle these links later.
			// For now, let's assume a '/s/:data' structure or query param.
			// Using a fragment identifier (#) is simpler for client-side only handling.
			const baseUrl = window.location.origin + window.location.pathname;
			generatedLink = `${baseUrl}#share=${encoded}`;
		} catch (e) {
			console.error('Error generating share link:', e);
			generatedLink = 'Error generating link.';
		}
	}

	async function generateLinkAndUpdateDisplay() {
		generateLink();

		if (isShortenUrlEnabled) {
			if (!checkInternetConnection()) {
				showToast('No internet connection. Cannot shorten URL.');
				isShortenUrlEnabled = false; // Turn off switch
				actualLinkToDisplay = generatedLink;
				return;
			}
			isShortening = true;
			showApiLimitsInfo = true; // Show limits when trying to shorten
			try {
				const response = await fetch('https://spoo.me/', {
					method: 'POST',
					headers: {
						Accept: 'application/json',
						'Content-Type': 'application/x-www-form-urlencoded'
					},
					body: new URLSearchParams({ url: generatedLink })
				});

				if (response.ok) {
					const data = await response.json();
					actualLinkToDisplay = data.short_url;
					showToast('URL shortened successfully!');
				} else if (response.status === 429) {
					showToast('Spoo.me API rate limit reached. Using original URL.', 5000);
					isShortenUrlEnabled = false; // Turn off switch
					actualLinkToDisplay = generatedLink;
				} else {
					const errorText = await response.text();
					showToast(`Failed to shorten URL (Error ${response.status}). Using original URL.`, 5000);
					console.error('Spoo.me API error:', errorText);
					isShortenUrlEnabled = false; // Turn off switch
					actualLinkToDisplay = generatedLink;
				}
			} catch (error) {
				showToast('Error connecting to URL shortener. Using original URL.', 5000);
				console.error('Network or other error:', error);
				isShortenUrlEnabled = false; // Turn off switch
				actualLinkToDisplay = generatedLink;
			} finally {
				isShortening = false;
			}
		} else {
			actualLinkToDisplay = generatedLink;
			showApiLimitsInfo = false;
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
		generateLinkAndUpdateDisplay(); // Generate link initially
	});

	// Regenerate link when options change
	$: if (markdownInput || isEditable || isShareRtl || shareTheme) {
		// If any of the core options change, we must regenerate the base link.
		// If shortening was enabled, we'll disable it to force the user to re-opt-in for the new URL.
		const wasShorteningEnabled = isShortenUrlEnabled;
		if (isShortenUrlEnabled) {
			isShortenUrlEnabled = false; // This will trigger the reactive block below to reset display and hide API limits.
		}
		generateLinkAndUpdateDisplay(); // This will now generate the new long link and update the display.
		// Since isShortenUrlEnabled is false, no shortening attempt will be made here.
		if (wasShorteningEnabled) {
			// Optionally, inform the user that shortening was disabled.
			// The reactive block for isShortenUrlEnabled=false will show "URL shortening disabled."
		}
	}

	// Handle manual toggling of the shorten checkbox and its effects
	$: if (isShortenUrlEnabled) {
		// Checkbox is checked or programmatically set to true
		if (!isShortening && !generatedLink.startsWith('Error')) {
			// If not already in the process of shortening and the base link is valid,
			// attempt to shorten. generateLinkAndUpdateDisplay will handle API call & UI updates.
			generateLinkAndUpdateDisplay();
		} else if (generatedLink.startsWith('Error')) {
			// If the base link itself has an error, we can't shorten.
			// Force uncheck the checkbox and notify the user.
			isShortenUrlEnabled = false; // This will trigger the 'else' block below.
			showToast('Cannot shorten: Fix error in generating base link first.', 3000);
		}
		// If 'isShortening' is true, it means an operation is in progress.
		// generateLinkAndUpdateDisplay() is already running and will update UI upon completion/failure.
		// No further action needed in this reactive step for that case.
	} else {
		// Checkbox is unchecked or programmatically set to false
		if (!isShortening) {
			// Only proceed if not in the middle of a shortening attempt
			if (actualLinkToDisplay !== generatedLink && !generatedLink.startsWith('Error')) {
				// If we were displaying a shortened URL, and the base link is fine, revert to the long link.
				actualLinkToDisplay = generatedLink;
				showToast('URL shortening disabled.', 2000);
			} else if (generatedLink.startsWith('Error') && actualLinkToDisplay !== generatedLink) {
				// If the base link is an error, ensure we are displaying that error.
				actualLinkToDisplay = generatedLink;
			}
			// When shortening is disabled, API limits info should not be shown based on this explicit state.
			showApiLimitsInfo = false;
		}
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

			<!-- Shorten URL Switch -->
			<div>
				<label class="flex items-center space-x-2 pt-4">
					<input
						type="checkbox"
						bind:checked={isShortenUrlEnabled}
						class="form-checkbox h-5 w-5 text-blue-600"
						disabled={isShortening || generatedLink.startsWith('Error')}
					/>
					<span>Shorten generated URL {isShortening ? '(Working...)' : ''}</span>
				</label>
				{#if isShortenUrlEnabled || showApiLimitsInfo}
					<p class="ml-7 text-sm text-gray-500 {generatedLink.startsWith('Error') ? 'hidden' : ''}">
						Using spoo.me (Limits: 5/min, 50/hour, 500/day).
					</p>
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
				bind:value={actualLinkToDisplay}
				class="h-24 w-full resize-none rounded-md border border-gray-300 bg-gray-50 p-2 font-mono text-xs"
				aria-label="Generated Shareable Link"
			></textarea>
		</div>

		<!-- Toast Message Area -->
		{#if toastMessage}
			<div
				class="mb-4 rounded-md bg-slate-700 p-3 text-center text-sm text-white shadow-lg transition-all duration-300 ease-in-out"
			>
				{toastMessage}
			</div>
		{/if}

		<div class="flex justify-end space-x-3">
			<button
				on:click={() => dispatch('close')}
				class="rounded bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300"
			>
				Close
			</button>
			<button
				on:click={copyLink}
				class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
				disabled={!actualLinkToDisplay || actualLinkToDisplay.startsWith('Error') || isShortening}
			>
				Copy Link
			</button>
		</div>
	</div>
</div>

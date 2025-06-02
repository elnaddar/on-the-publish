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
			const compressed = pako.deflate(jsonString, { to: 'string' });
			// Base64 encode the compressed string to make it URL-safe
			const encoded = btoa(compressed);

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

	function copyLink() {
		if (navigator.clipboard && generatedLink) {
			navigator.clipboard
				.writeText(generatedLink)
				.then(() => alert('Link copied to clipboard!'))
				.catch((err) => console.error('Failed to copy link: ', err));
		}
	}

	onMount(() => {
		generateLink(); // Generate link initially
	});

	// Regenerate link when options change
	$: if (markdownInput || isEditable || isShareRtl || shareTheme) {
		generateLink();
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

		<div class="mb-4">
			<label for="generatedLinkTextarea" class="mb-1 block text-sm font-medium text-gray-700"
				>Shareable Link:</label
			>
			<textarea
				id="generatedLinkTextarea"
				readonly
				bind:value={generatedLink}
				class="h-24 w-full resize-none rounded-md border border-gray-300 bg-gray-50 p-2 font-mono text-xs"
				aria-label="Generated Shareable Link"
			></textarea>
		</div>

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
				disabled={!generatedLink || generatedLink.startsWith('Error')}
			>
				Copy Link
			</button>
		</div>
	</div>
</div>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment'; // Import browser

	export let initialRatio = 0.5; // Initial size ratio of the left/top pane
	export let minLeftPixels = 50; // Minimum size in pixels for the left/top pane
	export let minRightPixels = 50; // Minimum size in pixels for the right/bottom pane
	export let vertical = false; // false for horizontal split, true for vertical
	export let disableResizer = false; // New prop to disable resizing
	export let isRtl = false; // ADDED: RTL mode flag

	let containerEl: HTMLDivElement;
	let leftPaneEl: HTMLDivElement;
	let rightPaneEl: HTMLDivElement;
	let draggerEl: HTMLDivElement;

	let isDragging = false;
	let currentRatio: number = initialRatio; // Initialize with prop

	function updatePaneSizes() {
		if (!leftPaneEl || !rightPaneEl) return;

		// Clear existing inline styles that might conflict, especially on orientation change
		leftPaneEl.style.width = '';
		leftPaneEl.style.height = '';
		rightPaneEl.style.width = '';
		rightPaneEl.style.height = '';

		if (vertical) {
			leftPaneEl.style.height = `${currentRatio * 100}%`;
			rightPaneEl.style.height = `${(1 - currentRatio) * 100}%`;
			leftPaneEl.style.width = '100%';
			rightPaneEl.style.width = '100%';
		} else {
			leftPaneEl.style.width = `${currentRatio * 100}%`;
			rightPaneEl.style.width = `${(1 - currentRatio) * 100}%`;
			leftPaneEl.style.height = '100%';
			rightPaneEl.style.height = '100%';
		}
	}

	function startDrag(event: MouseEvent | TouchEvent) {
		if (disableResizer) return;
		event.preventDefault(); // Prevent text selection, etc.
		isDragging = true;

		if (browser) {
			document.addEventListener('mousemove', onDrag);
			document.addEventListener('touchmove', onDrag, { passive: false });
			document.addEventListener('mouseup', endDrag);
			document.addEventListener('touchend', endDrag);
			document.body.style.userSelect = 'none';
		}
		if (draggerEl) {
			draggerEl.classList.add('dragger-active');
		}
	}

	function onDrag(event: MouseEvent | TouchEvent) {
		if (!isDragging || !containerEl) return;

		let clientX: number;
		let clientY: number;

		if (event instanceof MouseEvent) {
			clientX = event.clientX;
			clientY = event.clientY;
		} else if (event.touches && event.touches[0]) {
			clientX = event.touches[0].clientX;
			clientY = event.touches[0].clientY;
		} else {
			return;
		}

		const containerRect = containerEl.getBoundingClientRect();
		let newRatio: number;

		if (vertical) {
			if (containerRect.height === 0) {
				console.warn('ResizablePanes: Container height is 0, cannot calculate ratio.');
				return;
			}
			const newTopHeight = clientY - containerRect.top;
			newRatio = newTopHeight / containerRect.height;

			const calculatedTopSize = newRatio * containerRect.height;
			const calculatedBottomSize = (1 - newRatio) * containerRect.height;

			if (calculatedTopSize < minLeftPixels) {
				newRatio = minLeftPixels / containerRect.height;
			} else if (calculatedBottomSize < minRightPixels) {
				newRatio = (containerRect.height - minRightPixels) / containerRect.height;
			}
		} else { // Horizontal
			if (containerRect.width === 0) {
				console.warn('ResizablePanes: Container width is 0, cannot calculate ratio.');
				return;
			}
			let newLeftWidth = clientX - containerRect.left;
			if (isRtl) { // ADDED: In RTL, invert the calculation relative to container width
				newLeftWidth = containerRect.width - (clientX - containerRect.left);
			}
			newRatio = newLeftWidth / containerRect.width;

			const calculatedLeftSize = newRatio * containerRect.width;
			const calculatedRightSize = (1 - newRatio) * containerRect.width;

			if (calculatedLeftSize < minLeftPixels) {
				newRatio = minLeftPixels / containerRect.width;
			} else if (calculatedRightSize < minRightPixels) {
				newRatio = (containerRect.width - minRightPixels) / containerRect.width;
			}
		}

		if (typeof newRatio === 'number' && !isNaN(newRatio) && isFinite(newRatio)) {
			currentRatio = Math.max(0, Math.min(1, newRatio));
			updatePaneSizes();
		} else {
			// This warning is useful if newRatio somehow becomes NaN/Infinity after the min/max logic, though unlikely with current setup.
			// console.warn('ResizablePanes: Calculated newRatio is invalid after clamping attempt:', newRatio, currentRatio);
		}
	}

	function endDrag() {
		if (!isDragging) return;
		isDragging = false;
		if (browser) {
			document.removeEventListener('mousemove', onDrag);
			document.removeEventListener('touchmove', onDrag);
			document.removeEventListener('mouseup', endDrag);
			document.removeEventListener('touchend', endDrag);
			document.body.style.userSelect = '';
		}
		if (draggerEl) {
			draggerEl.classList.remove('dragger-active');
		}
	}

	onMount(() => {
		currentRatio = initialRatio; // Ensure currentRatio is set from prop on mount
		updatePaneSizes();
		// Event listeners for dragger are added/removed reactively based on disableResizer
	});

	onDestroy(() => {
		if (isDragging && browser) {
			// Clean up global listeners if component is destroyed while dragging
			endDrag(); 
		}
		// Dragger-specific listeners are handled by the reactive block for disableResizer
	});

	// Reactive updates
	$: {
		// When initialRatio prop changes externally (e.g. read-only mode toggle)
		// Only update if not actively dragging to prevent overriding user interaction.
		if (initialRatio !== currentRatio && !isDragging) {
			currentRatio = initialRatio;
		}
	}

	$: {
		// Update pane sizes whenever the ratio or orientation changes, and in browser context with elements ready.
		// This reactive block will also ensure initial setup and changes from initialRatio prop are applied.
		if (browser && leftPaneEl && rightPaneEl) { 
			updatePaneSizes();
		}
	}

	$: {
		// Manage dragger event listeners based on disableResizer prop
		if (browser && draggerEl) {
			if (disableResizer) {
				draggerEl.removeEventListener('mousedown', startDrag);
				draggerEl.removeEventListener('touchstart', startDrag);
				draggerEl.style.pointerEvents = 'none';
			} else {
				draggerEl.addEventListener('mousedown', startDrag);
				draggerEl.addEventListener('touchstart', startDrag, { passive: false });
				draggerEl.style.pointerEvents = 'auto';
			}
		}
	}
</script>

<div
	bind:this={containerEl}
	class="resizable-container flex h-full w-full overflow-hidden"
	class:flex-col={vertical}
>
	<div
		bind:this={leftPaneEl}
		class="left-pane relative overflow-auto"
	>
		<slot name="left"></slot>
	</div>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={draggerEl}
		class="dragger"
		class:vertical-dragger={vertical}
		class:horizontal-dragger={!vertical}
		class:disabled={disableResizer}
		style={disableResizer ? 'opacity: 0.5;' : 'opacity: 1;'}
		role="separator"
		aria-label="Resize panes"
		aria-orientation={vertical ? 'vertical' : 'horizontal'}
		aria-valuenow={Math.round(currentRatio * 100)}
		aria-valuemin={0}
		aria-valuemax={100}
		tabindex={disableResizer ? -1 : 0}
		on:keydown={(e) => {
			if (disableResizer) return;
			let step = 0.01;
			if (e.shiftKey) step = 0.1;

			if (e.key === 'ArrowLeft' && !vertical) { // MODIFIED: Adjust arrow key logic for RTL
				currentRatio = Math.max(0, currentRatio - (isRtl ? -step : step));
			} else if (e.key === 'ArrowRight' && !vertical) { // MODIFIED: Adjust arrow key logic for RTL
				currentRatio = Math.min(1, currentRatio + (isRtl ? -step : step));
			} else if (e.key === 'ArrowUp' && vertical) {
				currentRatio = Math.max(0, currentRatio - step);
			} else if (e.key === 'ArrowDown' && vertical) {
				currentRatio = Math.min(1, currentRatio + step);
			}
		}}
	></div>
	<div
		bind:this={rightPaneEl}
		class="right-pane relative overflow-auto"
	>
		<slot name="right"></slot>
	</div>
</div>

<style>
	.resizable-container {
		position: relative;
	}
	.left-pane,
	.right-pane {
		/* overflow: auto; */ /* Ensure this is handled by the slot content or parent if needed */
		/* Handled by inline styles for dynamic sizing */
	}

	.dragger {
		background-color: #ccc;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background-color 0.2s ease, opacity 0.2s ease;
	}

	.horizontal-dragger {
		width: 10px;
		cursor: col-resize;
		height: 100%;
		margin-left: -5px; /* Center the dragger */
		margin-right: -5px;
	}
	.horizontal-dragger:hover {
		background-color: #aaa; /* Hover style for horizontal */
	}

	.vertical-dragger {
		height: 10px;
		cursor: row-resize;
		width: 100%;
		margin-top: -5px; /* Center the dragger */
		margin-bottom: -5px;
	}
	.vertical-dragger:hover {
		background-color: #aaa; /* Hover style for vertical */
	}

	.dragger.dragger-active { /* Style for active dragging state, applies to base .dragger */
		background-color: #aaa;
	}

	/* Improve visibility of the dragger */
	.dragger::before {
		content: '';
		display: block;
		background-color: #888;
	}
	.horizontal-dragger::before {
		width: 2px;
		height: 20px;
	}
	.vertical-dragger::before {
		height: 2px;
		width: 20px;
	}

	.dragger.disabled {
		cursor: default;
		opacity: 0.5;
		display: none; /* Hide disabled dragger for article view */
	}
	.horizontal-dragger.disabled:hover,
	.vertical-dragger.disabled:hover {
		background-color: #ccc; /* No color change on hover when disabled */
	}
</style>
 
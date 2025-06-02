<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	export let initialRatio = 0.5; // Initial size ratio of the left/top pane
	export let minLeftPixels = 50; // Minimum size in pixels for the left/top pane
	export let minRightPixels = 50; // Minimum size in pixels for the right/bottom pane
	export let vertical = false; // false for horizontal split, true for vertical
	export let disableResizer = false; // New prop to disable resizing

	let containerEl: HTMLDivElement;
	let leftPaneEl: HTMLDivElement;
	let rightPaneEl: HTMLDivElement;
	let draggerEl: HTMLDivElement;

	let isDragging = false;
	let currentRatio: number = initialRatio;

	function startDrag(event: MouseEvent | TouchEvent) {
		if (disableResizer) return;
		event.preventDefault();
		isDragging = true;
		document.addEventListener('mousemove', onDrag);
		document.addEventListener('touchmove', onDrag, { passive: false });
		document.addEventListener('mouseup', endDrag);
		document.addEventListener('touchend', endDrag);
		document.body.style.userSelect = 'none'; // Prevent text selection during drag
		if (draggerEl) {
			draggerEl.classList.add(vertical ? 'active-vertical' : 'active-horizontal');
		}
	}

	function onDrag(event: MouseEvent | TouchEvent) {
		if (disableResizer || !isDragging || !containerEl || !leftPaneEl || !rightPaneEl) return;

		let movementX: number;
		let movementY: number;

		if (event instanceof MouseEvent) {
			movementX = event.clientX;
			movementY = event.clientY;
		} else if (event.touches && event.touches[0]) {
			movementX = event.touches[0].clientX;
			movementY = event.touches[0].clientY;
		} else {
			return;
		}

		const containerRect = containerEl.getBoundingClientRect();
		let newRatio: number;

		if (vertical) {
			const newTopHeight = movementY - containerRect.top;
			newRatio = newTopHeight / containerRect.height;
		} else {
			const newLeftWidth = movementX - containerRect.left;
			newRatio = newLeftWidth / containerRect.width;
		}

		// Enforce min sizes
		const leftPaneSize = vertical
			? containerRect.height * newRatio
			: containerRect.width * newRatio;
		const rightPaneSize = vertical
			? containerRect.height * (1 - newRatio)
			: containerRect.width * (1 - newRatio);

		if (leftPaneSize < minLeftPixels) {
			newRatio = vertical
				? minLeftPixels / containerRect.height
				: minLeftPixels / containerRect.width;
		} else if (rightPaneSize < minRightPixels) {
			newRatio = vertical
				? (containerRect.height - minRightPixels) / containerRect.height
				: (containerRect.width - minRightPixels) / containerRect.width;
		}

		currentRatio = Math.max(0, Math.min(1, newRatio)); // Clamp between 0 and 1
		updatePaneSizes();
	}

	function endDrag() {
		isDragging = false;
		document.removeEventListener('mousemove', onDrag);
		document.removeEventListener('touchmove', onDrag);
		document.removeEventListener('mouseup', endDrag);
		document.removeEventListener('touchend', endDrag);
		document.body.style.userSelect = '';
		if (draggerEl) {
			draggerEl.classList.remove(vertical ? 'active-vertical' : 'active-horizontal');
		}
	}

	function updatePaneSizes() {
		if (!leftPaneEl || !rightPaneEl) return;
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

	onMount(() => {
		updatePaneSizes();
		if (draggerEl && !disableResizer) {
			draggerEl.addEventListener('mousedown', startDrag);
			draggerEl.addEventListener('touchstart', startDrag, { passive: false });
		}
	});

	onDestroy(() => {
		endDrag(); // Clean up event listeners if component is destroyed while dragging
		if (draggerEl && !disableResizer) {
			draggerEl.removeEventListener('mousedown', startDrag);
			draggerEl.removeEventListener('touchstart', startDrag);
		}
	});

	// Watch for changes in disableResizer to add/remove event listeners
	$: if (draggerEl) {
		if (disableResizer) {
			draggerEl.removeEventListener('mousedown', startDrag);
			draggerEl.removeEventListener('touchstart', startDrag);
			draggerEl.style.pointerEvents = 'none';
			draggerEl.style.opacity = '0.5'; // Visually indicate it's disabled
		} else {
			draggerEl.addEventListener('mousedown', startDrag);
			draggerEl.addEventListener('touchstart', startDrag, { passive: false });
			draggerEl.style.pointerEvents = 'auto';
			draggerEl.style.opacity = '1';
		}
	}

	// Update when vertical prop changes or initialRatio changes externally
	$: {
		currentRatio = initialRatio; // Allow initialRatio to be reactive for read-only mode change
		if (leftPaneEl && rightPaneEl) {
			leftPaneEl.style.width = '';
			leftPaneEl.style.height = '';
			rightPaneEl.style.width = '';
			rightPaneEl.style.height = '';
			updatePaneSizes();
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
		style={`${vertical ? 'height' : 'width'}: ${currentRatio * 100}%;`}
	>
		<slot name="left"></slot>
	</div>
	<div
		bind:this={draggerEl}
		class="dragger"
		class:vertical-dragger={vertical}
		class:horizontal-dragger={!vertical}
		class:disabled={disableResizer}
		on:mousedown={startDrag}
		on:touchstart|preventDefault={startDrag}
		role="separator"
		aria-label="Resize panes"
		tabindex={disableResizer ? -1 : 0}
		on:keydown={(e) => {
			if (disableResizer) return;
			if (e.key === 'ArrowLeft' && !vertical) currentRatio = Math.max(0, currentRatio - 0.01);
			updatePaneSizes();
			if (e.key === 'ArrowRight' && !vertical) currentRatio = Math.min(1, currentRatio + 0.01);
			updatePaneSizes();
			if (e.key === 'ArrowUp' && vertical) currentRatio = Math.max(0, currentRatio - 0.01);
			updatePaneSizes();
			if (e.key === 'ArrowDown' && vertical) currentRatio = Math.min(1, currentRatio + 0.01);
			updatePaneSizes();
		}}
	></div>
	<div
		bind:this={rightPaneEl}
		class="right-pane relative overflow-auto"
		style={`${vertical ? 'height' : 'width'}: ${(1 - currentRatio) * 100}%;`}
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
		transition: background-color 0.2s ease;
	}

	.horizontal-dragger {
		width: 10px;
		cursor: col-resize;
		height: 100%;
		margin-left: -5px; /* Center the dragger */
		margin-right: -5px;
	}
	.horizontal-dragger:hover,
	.horizontal-dragger.active-horizontal {
		background-color: #aaa;
	}

	.vertical-dragger {
		height: 10px;
		cursor: row-resize;
		width: 100%;
		margin-top: -5px; /* Center the dragger */
		margin-bottom: -5px;
	}
	.vertical-dragger:hover,
	.vertical-dragger.active-vertical {
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
	}
	.horizontal-dragger.disabled:hover,
	.vertical-dragger.disabled:hover {
		background-color: #ccc; /* No color change on hover when disabled */
	}
</style>

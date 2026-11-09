<!--
  The quick-add command line, shared by the N palette, the planner drag box and the week drag box.
  Grey ghost text = format guide / completion. `/` opens the option menu at the cursor.
  Enter (no menu) -> onenter. Esc (no menu) -> onescape. onkey runs first for extra keys (return true = handled).
-->
<script lang="ts">
	import {
		activeOptionToken,
		ghostHint,
		optionsFor,
		parseQuickAdd,
		type QAContext,
		type QAOption,
	} from '$lib/quickadd';
	import { colorsFor } from '$lib/colors';

	let {
		value = $bindable(''),
		ctx,
		slotted = false,
		size = 'lg',
		label = 'Quick add',
		placeholder = '',
		autofocus = false,
		describedby,
		onenter,
		onescape,
		onkey,
		oninput,
		onblur,
	}: {
		value?: string;
		ctx: QAContext;
		slotted?: boolean;
		size?: 'lg' | 'sm';
		label?: string;
		placeholder?: string;
		autofocus?: boolean;
		describedby?: string;
		onenter: () => void;
		onescape: () => void;
		onkey?: (e: KeyboardEvent) => boolean;
		oninput?: () => void;
		onblur?: () => void;
	} = $props();

	let input: HTMLInputElement | undefined = $state();
	let menuIdx = $state(0);
	let menuHidden = $state(false);
	let menuLeft = $state(0);
	const uid = `qm-${Math.random().toString(36).slice(2, 8)}`;

	const parsed = $derived(parseQuickAdd(value, ctx));
	const optTok = $derived(activeOptionToken(value));
	const options = $derived(optTok ? optionsFor(optTok) : []);
	const ghost = $derived(placeholder && !value ? '' : ghostHint(value, parsed, slotted));
	const menuOpen = $derived(!menuHidden && options.length > 0);
	const before = $derived(optTok ? parseQuickAdd(value.slice(0, value.length - optTok.length), ctx) : parsed);

	export function focus() {
		input?.focus();
	}

	$effect(() => {
		if (autofocus) input?.focus();
	});

	function picked(o: QAOption): boolean {
		if (o.group === 'Type') return before.typeSet && before.type === o.type;
		return before.targetSet && before.target === o.target;
	}

	function placeMenu() {
		if (!input || !optTok) return;
		const cs = getComputedStyle(input);
		const c = document.createElement('canvas').getContext('2d');
		if (!c) return;
		c.font = cs.font;
		const w = c.measureText(value.slice(0, value.length - optTok.length)).width;
		const left = parseFloat(cs.paddingLeft) + w - input.scrollLeft;
		menuLeft = Math.max(0, Math.min(left, input.clientWidth - 250));
	}
	$effect(() => {
		void optTok;
		void value;
		placeMenu();
	});
	$effect(() => {
		if (menuIdx >= options.length) menuIdx = 0;
	});

	function pick(i: number) {
		const o = options[i];
		if (!o || !optTok) return;
		value = value.slice(0, value.length - optTok.length) + o.token + ' ';
		menuIdx = 0;
		oninput?.();
		input?.focus();
	}

	function onKey(e: KeyboardEvent) {
		e.stopPropagation(); // planner/week keys never see typing
		if (menuOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
			e.preventDefault();
			menuIdx = (menuIdx + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
			return;
		}
		if (menuOpen && (e.key === 'Enter' || e.key === 'Tab')) {
			e.preventDefault();
			pick(menuIdx);
			return;
		}
		if (e.key === 'Escape' && menuOpen) {
			e.preventDefault();
			menuHidden = true;
			return;
		}
		if (onkey?.(e)) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			onescape();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			onenter();
		} else if (e.key === 'Tab') {
			e.preventDefault();
		}
	}
</script>

<div class="iw {size}">
	<div class="ghost" aria-hidden="true">
		{#if placeholder && !value}{placeholder}{:else}<span class="typed">{value}</span>{ghost}{/if}
	</div>
	<input
		bind:this={input}
		bind:value
		class="in"
		autocomplete="off"
		spellcheck="false"
		aria-label={label}
		aria-autocomplete="list"
		aria-controls={uid}
		aria-expanded={menuOpen}
		aria-describedby={describedby}
		oninput={() => {
			menuHidden = false;
			oninput?.();
		}}
		onkeydown={onKey}
		onscroll={placeMenu}
		onblur={() => onblur?.()}
		onpointerdown={(e) => e.stopPropagation()}
	/>
	{#if menuOpen}
		<div class="menu" id={uid} role="listbox" style:left="{menuLeft}px">
			{#each options as o, i (o.token)}
				{#if i === 0 || options[i - 1]?.group !== o.group}<div class="mg">{o.group}</div>{/if}
				<div
					class="mi"
					class:on={i === menuIdx}
					role="option"
					tabindex="-1"
					aria-selected={i === menuIdx}
					onmousedown={(e) => {
						e.preventDefault();
						pick(i);
					}}
					onpointerdown={(e) => e.stopPropagation()}
					onmouseenter={() => (menuIdx = i)}
				>
					{#if o.type}
						{@const c = colorsFor(o.type)}
						<span class="sw" style:background={c.bg} style:border-color={c.ink}></span>
					{:else}
						<span class="sw ic" aria-hidden="true"
							>{o.target === 'planner' ? '◷' : o.target === 'both' ? '⧉' : '▦'}</span
						>
					{/if}
					<span class="tok">{o.token}</span>
					{#if picked(o)}<span class="tick" aria-label="selected">✓</span>{/if}
					<span class="hint">{o.hint}</span>
				</div>
			{/each}
			<div class="mfoot">
				{#if slotted}
					Type a day or time to change the dragged one: <code>fri</code> <code>3pm to 5pm</code>
				{:else}
					Days and times need no slash: <code>fri</code> <code>next mon</code> <code>10 nov</code>
					<code>6pm to 10pm</code>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.iw {
		position: relative;
	}
	.ghost,
	.in {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		letter-spacing: 0;
		white-space: pre;
	}
	.lg .ghost,
	.lg .in {
		font-size: 15px;
		padding: 0 16px;
		height: 52px;
		line-height: 52px;
	}
	.sm .ghost,
	.sm .in {
		font-size: 13px;
		padding: 0 8px;
		height: 30px;
		line-height: 30px;
	}
	.ghost {
		position: absolute;
		inset: 0;
		color: var(--quiet);
		opacity: 0.75;
		pointer-events: none;
		overflow: hidden;
	}
	.typed {
		color: transparent;
	}
	.in {
		position: relative;
		width: 100%;
		box-sizing: border-box;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--ink);
	}
	.sm {
		background: var(--field);
		border: 1px solid var(--input);
		border-radius: 7px;
	}
	.sm:focus-within {
		outline: 2px solid var(--ink);
		outline-offset: 1px;
	}
	.lg:focus-within {
		box-shadow: inset 0 -2px 0 var(--ink);
	}
	.menu {
		position: absolute;
		top: calc(100% + 2px);
		width: 250px;
		background: var(--raised);
		border-radius: 10px;
		padding: 4px;
		z-index: 20;
		font-size: 13px;
		color: var(--ink);
		cursor: default;
		border: 1.5px solid var(--card-edge);
		box-shadow: var(--shadow-card);
	}
	.mg {
		font-size: 11px;
		color: var(--quiet);
		padding: 4px 8px 2px;
	}
	.mi {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 8px;
		border-radius: 6px;
		cursor: pointer;
	}
	.mi.on {
		background: var(--rule);
		outline: 1px solid var(--border);
	}
	.sw {
		width: 12px;
		height: 12px;
		border-radius: 3px;
		border: 1px solid;
		flex: none;
	}
	.sw.ic {
		border: 0;
		font-size: 12px;
		line-height: 12px;
		text-align: center;
		color: var(--quiet);
	}
	.tok,
	code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	}
	.tick {
		font-size: 12px;
	}
	.hint {
		margin-left: auto;
		font-size: 11px;
		color: var(--quiet);
	}
	.mfoot {
		font-size: 11px;
		color: var(--quiet);
		padding: 6px 8px 4px;
		margin-top: 4px;
		border-top: 1px solid var(--rule);
		line-height: 1.7;
	}
	code {
		font-size: 11px;
		background: var(--rule);
		border-radius: 4px;
		padding: 0 4px;
	}
</style>

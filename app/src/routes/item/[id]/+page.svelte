<!-- FR-I1..I5 (DesktopItem.dc.html). Own items only in P1 (P2 adds read-only partner card). -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import StatusSquare from '$lib/components/StatusSquare.svelte';
	import Markdown from '$lib/components/Markdown.svelte';
	import { colorsFor } from '$lib/colors';
	import { diffDays, prettyDate, prettyTime, utcToLocal } from '$lib/time';
	import { TYPES } from '$lib/types';
	import { post } from '$lib/client/api';
	import { showError } from '$lib/client/toast.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data, form } = $props();
	const it = $derived(data.item);
	const c = $derived(colorsFor(it.type));
	const STATUS_WORD = { todo: 'NOT STARTED', doing: 'IN PROGRESS', done: 'DONE' } as const;
	let editNotes = $state(false);
	let notes = $state('');
	$effect.pre(() => {
		notes = data.item.notes ?? '';
	});
	const course = $derived(data.courses.find((x) => x.id === it.courseId));
	const daysLeft = $derived(it.date ? diffDays(data.today, it.date) : null);
	const pct = $derived(
		data.steps.length
			? Math.round((data.steps.filter((s) => s.status === 'done').length / data.steps.length) * 100)
			: 0,
	);
	const fmtZ = (z: string | null) => (z ? prettyDate(z.slice(0, 10)) : '—');

	async function cycle(id: string) {
		try {
			await post(`/api/items/${id}/cycle`);
			await invalidateAll();
		} catch (e) {
			showError(e);
		}
	}
</script>

<svelte:head><title>{it.title} · Life Tracker</title></svelte:head>

<main class="wrap">
	<section class="col main">
		<nav aria-label="Breadcrumb" class="crumb">
			<a href="/?d={it.date ?? ''}">Home</a><span>/</span>
			{#if data.parent}<a href="/item/{data.parent.id}">{data.parent.title}</a><span>/</span>{/if}
			<span>{it.title}</span>
		</nav>

		<div class="title">
			<StatusSquare status={it.status} size={28} ink={c.ink} oncycle={() => cycle(it.id)} />
			<div>
				<span class="kicker" style:color={c.ink}
					>{(it.type ?? 'None').toUpperCase()} · {STATUS_WORD[it.status]}</span
				>
				<h1 class:done={it.status === 'done'}>{it.title}</h1>
			</div>
		</div>

		<div class="facts">
			<div class="fact"><span>Type</span><b style:color={c.ink}>{it.type ?? 'None'}</b></div>
			<div class="fact">
				<span>Date</span><b
					>{it.date ? prettyDate(it.date) : 'Unscheduled'}{it.time
						? ` · ${prettyTime(it.time)}`
						: ''}{it.endDate ? ` → ${prettyDate(it.endDate)}` : ''}</b
				>
			</div>
			<div class="fact"><span>Course</span><b>{course?.name ?? '—'}</b></div>
			<div class="fact">
				<span>Days left</span><b>{daysLeft === null ? '—' : daysLeft < 0 ? `${-daysLeft} ago` : daysLeft}</b>
			</div>
		</div>

		<form
			method="post"
			action="?/save"
			class="card edit"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: false })}
		>
			<h2>Details</h2>
			<div class="field">
				<label for="f-title">Title</label>
				<input id="f-title" class="input" name="title" value={it.title} required maxlength="300" />
			</div>
			<div class="grid2">
				<div class="field">
					<label for="f-type">Type</label>
					<select id="f-type" class="input" name="type" value={it.type ?? ''}>
						<option value="">None</option>
						{#each TYPES as t (t)}<option value={t}>{t}</option>{/each}
					</select>
				</div>
				<div class="field">
					<label for="f-status">Status</label>
					<select id="f-status" class="input" name="status" value={it.status}>
						<option value="todo">Not started</option>
						<option value="doing">In progress</option>
						<option value="done">Done</option>
					</select>
				</div>
				<div class="field">
					<label for="f-date">Date</label>
					<input id="f-date" class="input" type="date" name="date" value={it.date ?? ''} />
					<span class="hint">Empty = Unscheduled</span>
				</div>
				<div class="field">
					<label for="f-time">Time</label>
					<input id="f-time" class="input" type="time" name="time" step="900" value={it.time ?? ''} />
					<span class="hint">Empty = all day</span>
				</div>
				<div class="field">
					<label for="f-end">End date (inclusive)</label>
					<input id="f-end" class="input" type="date" name="endDate" value={it.endDate ?? ''} />
				</div>
				<div class="field">
					<label for="f-course">Course</label>
					<select id="f-course" class="input" name="courseId" value={it.courseId ?? ''}>
						<option value="">—</option>
						{#each data.courses as co (co.id)}<option value={co.id}>{co.code} · {co.name}</option>{/each}
					</select>
				</div>
			</div>
			<div class="field">
				<div class="row-between">
					<label for="f-notes">Notes</label>
					<button type="button" class="btn sm ghost" onclick={() => (editNotes = !editNotes)}
						>{editNotes ? 'Preview' : 'Edit'}</button
					>
				</div>
				{#if editNotes || !notes}
					<textarea
						id="f-notes"
						class="input"
						name="notes"
						rows="6"
						bind:value={notes}
						placeholder="Write in Markdown: requirements, links, submission portal…"></textarea>
				{:else}
					<input type="hidden" name="notes" value={notes} />
					<div class="notes"><Markdown source={notes} /></div>
				{/if}
			</div>
			<label class="check">
				<input type="checkbox" name="private" checked={it.private} />
				<span
					><b>Keep secret from shared calendars</b><span class="hint">
						· shows as Busy to anyone you share with</span
					></span
				>
			</label>
			<div class="row">
				<button class="btn primary" type="submit">Save</button>
				{#if form?.saved}<span class="ok-note" role="status">Saved.</span>{/if}
				{#if form?.message}<span class="alert" role="alert">{form.message}</span>{/if}
			</div>
		</form>

		{#if !data.parent}
			<div class="card steps">
				<div class="row-between">
					<h2>Steps</h2>
					<span class="muted"
						>{data.steps.filter((s) => s.status === 'done').length}/{data.steps.length} done</span
					>
				</div>
				<div class="bar" aria-hidden="true"><div style:width="{pct}%"></div></div>
				{#each data.steps as s (s.id)}
					{@const sc = colorsFor(s.type)}
					<div class="step">
						<StatusSquare status={s.status} ink={sc.ink} oncycle={() => cycle(s.id)} />
						<a href="/item/{s.id}" class:done={s.status === 'done'}>{s.title}</a>
						<span class="muted">{s.date ? prettyDate(s.date) : ''}</span>
					</div>
				{/each}
				<form method="post" action="?/addStep" class="addstep" use:enhance>
					<label class="sr-only" for="st-title">New step</label>
					<input
						id="st-title"
						class="input sm"
						name="title"
						placeholder="+ Add step"
						required
						maxlength="300"
					/>
					<label class="sr-only" for="st-date">Step date</label>
					<input id="st-date" class="input sm" type="date" name="date" />
					<button class="btn sm" type="submit">Add</button>
				</form>
				{#if form?.stepMessage}<span class="alert">{form.stepMessage}</span>{/if}
			</div>
		{/if}
	</section>

	<aside class="col side">
		<div class="card box">
			<h2>Time blocks</h2>
			{#each data.blocks as b (b.id)}
				{@const s = utcToLocal(b.startAt, data.user?.timezone ?? 'Asia/Kuala_Lumpur')}
				{@const e = utcToLocal(b.endAt, data.user?.timezone ?? 'Asia/Kuala_Lumpur')}
				<a class="blk" href="/?d={s.date}" style:background={c.bg} style:color={c.ink}>
					<b>{b.label}</b><span>{prettyDate(s.date)} · {s.time}–{e.time}</span>
				</a>
			{:else}
				<span class="muted">No time blocked for this yet.</span>
			{/each}
			{#if it.date}<a class="btn sm" href="/?d={it.date}">Block time in the planner</a>{/if}
		</div>
		{#if course}
			<div class="card box">
				<h2>Also in {course.name}</h2>
				{#each data.also as a (a.id)}
					{@const ac = colorsFor(a.type)}
					<div class="also">
						<StatusSquare status={a.status} size={14} ink={ac.ink} oncycle={() => cycle(a.id)} />
						<a href="/item/{a.id}" class:done={a.status === 'done'}>{a.title}</a>
						<span class="muted">{a.date ? a.date.slice(5) : ''}</span>
					</div>
				{:else}
					<span class="muted">Nothing else yet.</span>
				{/each}
			</div>
		{/if}
		<div class="card box hist">
			<h2>History</h2>
			<span>Created {fmtZ(data.history.createdAt)}{data.history.source === 'notion' ? ' (Notion)' : ''}</span>
			<span>Started {fmtZ(data.history.startedAt)}</span>
			<span>Completed {fmtZ(data.history.completedAt)}</span>
			<span
				>Edited {fmtZ(data.history.updatedAt)}{data.history.updatedBy
					? ` by ${data.history.updatedBy}`
					: ''}</span
			>
		</div>
		<form
			method="post"
			action="?/delete"
			class="card box"
			use:enhance={({ cancel }) => {
				if (
					!confirm(
						`Delete "${it.title}"${data.steps.length ? ` and its ${data.steps.length} steps` : ''}? You can restore it from Trash for 30 days.`,
					)
				)
					cancel();
			}}
		>
			<button class="btn danger" type="submit">Delete item</button>
			<a href="/trash" class="hint">Trash</a>
		</form>
	</aside>
</main>

<style>
	.wrap {
		padding: 20px 24px;
		display: flex;
		gap: 20px;
		flex-wrap: wrap;
		align-items: flex-start;
		max-width: 1280px;
		margin: 0 auto;
	}
	.col {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-width: 0;
	}
	.main {
		flex: 2 1 600px;
	}
	.side {
		flex: 1 1 300px;
	}
	.crumb {
		display: flex;
		gap: 8px;
		font-size: 13px;
		color: var(--quiet);
		flex-wrap: wrap;
	}
	.title {
		display: flex;
		gap: 14px;
		align-items: flex-start;
	}
	.kicker {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
	}
	h1 {
		font-size: 26px;
		font-weight: 700;
	}
	h2 {
		font-size: 15px;
		font-weight: 700;
	}
	.done {
		text-decoration: line-through;
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 10px;
	}
	.fact {
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.fact span {
		font-size: 12px;
		color: var(--quiet);
	}
	.edit,
	.steps,
	.box {
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.grid2 {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 12px;
	}
	.row {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
	}
	.row-between {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.check {
		display: flex;
		gap: 10px;
		align-items: center;
		font-size: 13px;
	}
	.check input {
		width: 18px;
		height: 18px;
	}
	.notes {
		border: 1px solid var(--rule);
		border-radius: 10px;
		padding: 10px 12px;
		font-size: 14px;
	}
	.bar {
		height: 8px;
		background: var(--rule);
		border-radius: 4px;
		overflow: hidden;
	}
	.bar div {
		height: 100%;
		background: var(--ink);
	}
	.step,
	.also {
		display: flex;
		gap: 10px;
		align-items: center;
		font-size: 14px;
	}
	.step a,
	.also a {
		flex: 1;
		min-width: 0;
		color: var(--ink);
	}
	.addstep {
		display: flex;
		gap: 8px;
	}
	.addstep .input {
		width: auto;
		flex: 0 0 170px;
	}
	.addstep #st-title {
		flex: 1 1 auto;
	}
	.blk {
		display: flex;
		flex-direction: column;
		padding: 8px 10px;
		border-radius: 8px;
		font-size: 13px;
	}
	.hist span {
		font-size: 13px;
		color: var(--quiet);
	}
</style>

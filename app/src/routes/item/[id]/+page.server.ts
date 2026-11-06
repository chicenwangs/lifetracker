import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import * as items from '$lib/server/repo/items';
import * as blocks from '$lib/server/repo/blocks';
import * as courses from '$lib/server/repo/courses';
import { ApiFail } from '$lib/server/http';
import { todayLocal } from '$lib/time';
import type { ItemDTO } from '$lib/types';

const nf = () => error(404, { code: 'not_found', message: 'Not found' });

export const load: PageServerLoad = ({ locals, params }) => {
	const me = locals.user as App.SafeUser;
	const row = items.getOwn(me.id, params.id);
	if (!row) nf();
	const it = row as items.ItemRow;
	const parent = it.parentId ? items.getOwn(me.id, it.parentId) : undefined;
	return {
		item: { ...(items.withCounts([it])[0] as ItemDTO), notes: it.notes },
		parent: parent ? { id: parent.id, title: parent.title } : null,
		steps: items.withCounts(items.steps(me.id, it.id)),
		blocks: blocks.forItem(me.id, it.id).map((b) => blocks.toDTO(b, it.type)),
		also: items.withCounts(items.alsoInCourse(me.id, it)),
		courses: courses.list(me.id),
		history: {
			createdAt: it.createdAt,
			startedAt: it.startedAt,
			completedAt: it.completedAt,
			updatedAt: it.updatedAt,
			updatedBy: items.editorName(it.updatedBy),
			source: it.source,
		},
		today: todayLocal(me.timezone),
	};
};

function run<T>(fn: () => T) {
	try {
		return { ok: true as const, value: fn() };
	} catch (e) {
		if (e instanceof ApiFail) return { ok: false as const, message: e.message, status: e.status };
		throw e;
	}
}

const str = (f: FormData, k: string) => {
	const v = f.get(k);
	return typeof v === 'string' ? v : '';
};
const orNull = (s: string) => (s.trim() === '' ? null : s.trim());

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		const me = locals.user as App.SafeUser;
		const f = await request.formData();
		const parsed = items.itemPatchSchema.safeParse({
			title: str(f, 'title'),
			type: orNull(str(f, 'type')),
			status: str(f, 'status') || undefined,
			date: orNull(str(f, 'date')),
			time: orNull(str(f, 'time')),
			endDate: orNull(str(f, 'endDate')),
			courseId: orNull(str(f, 'courseId')),
			notes: orNull(str(f, 'notes')),
			private: f.get('private') === 'on',
		});
		if (!parsed.success) return fail(400, { message: parsed.error.issues[0]?.message ?? 'Bad input' });
		const r = run(() => items.patch(me.id, params.id, parsed.data));
		if (!r.ok) return r.status === 404 ? nf() : fail(400, { message: r.message });
		return { saved: true };
	},
	addStep: async ({ request, locals, params }) => {
		const me = locals.user as App.SafeUser;
		const f = await request.formData();
		const parent = items.getOwn(me.id, params.id);
		if (!parent) nf();
		const input = items.itemCreateSchema.safeParse({
			title: str(f, 'title'),
			date: orNull(str(f, 'date')),
			type: parent?.type ?? null,
			courseId: parent?.courseId ?? null,
			parentId: params.id,
		});
		if (!input.success) return fail(400, { stepMessage: input.error.issues[0]?.message ?? 'Bad step' });
		const r = run(() => items.create(me.id, input.data));
		if (!r.ok) return fail(400, { stepMessage: r.message });
		return { stepAdded: true };
	},
	cycle: async ({ request, locals }) => {
		const me = locals.user as App.SafeUser;
		const id = str(await request.formData(), 'id');
		const r = run(() => items.cycle(me.id, id));
		if (!r.ok) return fail(r.status, { message: r.message });
		return {};
	},
	delete: async ({ locals, params }) => {
		const me = locals.user as App.SafeUser;
		const it = items.getOwn(me.id, params.id);
		if (!it) nf();
		const r = run(() => items.softDelete(me.id, params.id));
		if (!r.ok) return fail(r.status, { message: r.message });
		redirect(303, it?.parentId ? `/item/${it.parentId}` : '/?deleted=1');
	},
};

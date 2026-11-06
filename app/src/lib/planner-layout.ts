// Pure layout for one planner day: clip blocks to the day, then pack overlapping blocks into columns.
import { clipToDay } from './time';
import type { BlockDTO } from './types';

export interface Piece {
	b: BlockDTO;
	top: number;
	bottom: number;
	clippedStart: boolean;
	clippedEnd: boolean;
	col: number;
	cols: number;
}

export function layoutDay(
	blocks: BlockDTO[],
	date: string,
	tz: string,
	over: Record<string, { startAt: string; endAt: string }> = {},
): Piece[] {
	const list: Piece[] = [];
	for (const b0 of blocks) {
		const o = over[b0.id];
		const b = o ? { ...b0, ...o } : b0;
		const c = clipToDay(b.startAt, b.endAt, date, tz);
		if (c) list.push({ b, ...c, col: 0, cols: 1 });
	}
	list.sort((a, b) => a.top - b.top || b.bottom - a.bottom);
	let cluster: Piece[] = [];
	let clusterEnd = -1;
	const flush = () => {
		const ends: number[] = [];
		for (const p of cluster) {
			let c = ends.findIndex((e) => e <= p.top);
			if (c < 0) {
				c = ends.length;
				ends.push(p.bottom);
			} else ends[c] = p.bottom;
			p.col = c;
		}
		for (const p of cluster) p.cols = ends.length;
		cluster = [];
	};
	for (const p of list) {
		if (p.top >= clusterEnd && cluster.length) flush();
		cluster.push(p);
		clusterEnd = Math.max(clusterEnd, p.bottom);
	}
	if (cluster.length) flush();
	return list;
}

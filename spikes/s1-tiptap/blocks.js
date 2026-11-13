// Block select / move / duplicate / delete as plain ProseMirror transactions on top-level nodes.
import { NodeSelection } from '@tiptap/pm/state';

/** top-level block holding the selection: its index, start position and node */
function current(state) {
	const $from = state.selection.$from;
	const index = $from.index(0);
	return { index, pos: $from.posAtIndex(index, 0), node: state.doc.child(index) };
}
const selectAt = (tr, pos) => tr.setSelection(NodeSelection.create(tr.doc, pos));

export const blockOps = {
	select: (view) => view.dispatch(selectAt(view.state.tr, current(view.state).pos)),
	duplicate(view) {
		const { pos, node } = current(view.state);
		view.dispatch(selectAt(view.state.tr.insert(pos + node.nodeSize, node), pos + node.nodeSize));
	},
	remove(view) {
		const { pos, node } = current(view.state);
		view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
	},
	/** dir -1 = up, +1 = down. No-op at the edges. */
	move(view, dir) {
		const { index, pos, node } = current(view.state);
		const doc = view.state.doc;
		const to = index + dir;
		if (to < 0 || to >= doc.childCount) return;
		const tr = view.state.tr.delete(pos, pos + node.nodeSize);
		const at = dir < 0 ? pos - doc.child(to).nodeSize : pos + doc.child(to).nodeSize;
		view.dispatch(selectAt(tr.insert(at, node), at));
	},
};

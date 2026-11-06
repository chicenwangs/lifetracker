// FTS5 search (FR-SR1). P1: rebuild on import. P2: repo helpers upsert/delete + search UI.
import { handle } from './db';

export function rebuildFts(ownerId: string): void {
	const s = handle().sqlite;
	s.prepare(`DELETE FROM search_fts WHERE owner_id = ?`).run(ownerId);
	s.prepare(
		`INSERT INTO search_fts (kind, ref_id, owner_id, text)
		 SELECT 'item', i.id, c.owner_id, i.title || ' ' || COALESCE(i.notes, '')
		 FROM items i JOIN calendars c ON c.id = i.calendar_id
		 WHERE c.owner_id = ? AND i.deleted_at IS NULL`,
	).run(ownerId);
	s.prepare(
		`INSERT INTO search_fts (kind, ref_id, owner_id, text)
		 SELECT 'place', id, owner_id, name || ' ' || city || ' ' || COALESCE(notes, '')
		 FROM places WHERE owner_id = ? AND deleted_at IS NULL`,
	).run(ownerId);
	s.prepare(
		`INSERT INTO search_fts (kind, ref_id, owner_id, text)
		 SELECT 'list_item', li.id, l.owner_id, li.text || ' ' || COALESCE(li.note, '')
		 FROM list_items li JOIN lists l ON l.id = li.list_id WHERE l.owner_id = ?`,
	).run(ownerId);
	s.prepare(
		`INSERT INTO search_fts (kind, ref_id, owner_id, text)
		 SELECT 'fact', f.id, p.owner_id, f.text || ' ' || COALESCE(f.detail, '')
		 FROM person_facts f JOIN people p ON p.id = f.person_id WHERE p.owner_id = ?`,
	).run(ownerId);
	s.prepare(
		`INSERT INTO search_fts (kind, ref_id, owner_id, text)
		 SELECT 'idea', id, owner_id, text FROM ideas WHERE owner_id = ?`,
	).run(ownerId);
}

// Settings sections: the desktop side nav and the phone Settings list (#100) use the same list.
export const SECTIONS: { href: string; label: string; group: string; icon: string; admin?: true }[] = [
	{ href: '/settings/account', label: 'Account', group: 'You', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0' },
	{ href: '/settings/preferences', label: 'Preferences', group: 'You', icon: 'M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4' },
	{ href: '/settings/types', label: 'Item types', group: 'Planner', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
	{ href: '/settings/notifications', label: 'Notifications', group: 'Planner', icon: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4' },
	{ href: '/settings/calendar', label: 'Calendar feed', group: 'Planner', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
	{ href: '/settings/sessions', label: 'Devices', group: 'Account and data', icon: 'M7 3h10v18H7zM11 18h2' },
	{ href: '/settings/sharing', label: 'Sharing', group: 'Account and data', icon: 'M8 12a3 3 0 1 0 0-.01M16 6a3 3 0 1 0 0-.01M16 18a3 3 0 1 0 0-.01M10.6 10.6l3-2.2M10.6 13.4l3 2.2' },
	{ href: '/settings/import', label: 'Import', group: 'Account and data', icon: 'M12 3v12M7 10l5 5 5-5M4 21h16' },
	{ href: '/settings/help', label: 'Help', group: 'Help', icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01' },
	{ href: '/settings/users', label: 'Users', group: 'Admin', admin: true, icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M17 11a3 3 0 0 0 0-6M21 20a6 6 0 0 0-4-5.7' },
	{ href: '/trash', label: 'Trash', group: 'Account and data', icon: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14' },
]; // prettier-ignore

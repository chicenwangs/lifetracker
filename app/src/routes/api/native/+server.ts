// Android app (mobile/): widgets + reminder alarms read this every 15 min with the WebView's session cookie.
import { json } from '@sveltejs/kit';
import { api, me } from '$lib/server/http';
import { nativeSync } from '$lib/server/native';

export const GET = api((e) => json(nativeSync(me(e))));

import { mount } from 'svelte';
import Graph from './Graph.svelte';

const q = new URLSearchParams(location.search);
mount(Graph, {
	target: document.getElementById('app'),
	props: { nodes: Number(q.get('n') ?? 5000), edges: Number(q.get('e') ?? 20000) },
});

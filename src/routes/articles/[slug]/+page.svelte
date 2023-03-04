<script>
	import papers from '../../../data/papers.json';
	import { page } from '$app/stores';
	let paper = papers.find((paper) => paper.slug === $page.params.slug);

	const encoder = new TextEncoder();
</script>

<h1>CYBERNOISE</h1>
<h2>{paper.title}</h2>
<img src={`/images/${paper.id}.jpg`} alt="" />
<p>{paper.intro}</p>
<p>{paper.text}</p>

<style>
	img {
		width: 100%;
		aspect-ratio: 4/3;
		object-fit: cover;
	}
</style>

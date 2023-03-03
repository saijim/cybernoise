<script>
	import papers from '../../../data/papers.json';
	import { page } from '$app/stores';
	let paper = papers.find((paper) => paper.slug === $page.params.slug);
</script>

<h1>CYBERNOISE</h1>
<h2>{paper.title}</h2>
<p>{paper.intro}</p>
<p>{paper.text}</p>

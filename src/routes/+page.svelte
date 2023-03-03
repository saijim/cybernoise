<script>
	import papers from '../data/papers.json';
</script>

<h1>CYBERNOISE</h1>

{#each papers as paper}
	<h2><a href={`/articles/${paper.slug}`}>{paper.title}</a></h2>
	<img src={`/images/${paper.id}.jpg`} alt="" />

	<p>{paper.intro}</p>
{/each}

<style>
	img {
		width: 100%;
		height: 300px;
		object-fit: cover;
	}
</style>
